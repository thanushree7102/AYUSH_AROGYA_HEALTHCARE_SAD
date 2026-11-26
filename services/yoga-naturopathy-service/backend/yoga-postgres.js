
// Yoga-only PostgreSQL adapter.
// Keeps shared AYUSH identity, consent, audit and event-bus services unchanged.

require('dotenv').config();

const crypto = require('crypto');
const { Pool } = require('pg');

const {
  createService,
  finish,
  listen,
  authenticate,
  serviceOnly,
  forbid,
  invalid,
} = require('../../../libs/common/http');

const { validateFields, str } = require('../../../libs/common/validate');
const { checkAccess, clinical, audit } = require('../../../libs/common/internal');
const security = require('../../../libs/common/security');
const { SERVICES, SYSTEMS, EVENTS } = require('../../../libs/common/config');

module.exports = function buildYogaPostgres({ parts, strict = true }) {
  const key = 'yoga';
  const label = SYSTEMS[key];
  const T = 'yoga_parts';
  const A = 'yoga_assessments';

  if (!Array.isArray(parts) || !parts.length) {
    throw new Error('Yoga form definitions are missing.');
  }

  const requiredEnv = [
    'YOGA_PGHOST',
    'YOGA_PGDATABASE',
    'YOGA_PGUSER',
    'YOGA_PGPASSWORD',
  ];

  for (const name of requiredEnv) {
    if (!process.env[name]) {
      throw new Error(`Missing required environment setting: ${name}`);
    }
  }

  const pool = new Pool({
    host: process.env.YOGA_PGHOST,
    port: Number(process.env.YOGA_PGPORT || 5432),
    database: process.env.YOGA_PGDATABASE,
    user: process.env.YOGA_PGUSER,
    password: process.env.YOGA_PGPASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });

  pool.on('error', (err) => {
    console.error('[yoga] PostgreSQL pool error:', err.message);
  });

  const app = createService(key);
  const partById = Object.fromEntries(parts.map((p) => [p.id, p]));

  const asyncRoute = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  async function latest(cid, part) {
    const result = await pool.query(
      `SELECT data, version, saved_at
         FROM ${T}
        WHERE consultation_code = $1 AND part = $2
        ORDER BY version DESC
        LIMIT 1`,
      [cid, part]
    );

    if (!result.rows.length) return null;

    const row = result.rows[0];

    return {
      ...(row.data || {}),
      _version: row.version,
      _savedAt: row.saved_at,
    };
  }

  async function open(req, res, mode) {
    const result = await clinical.get(
      `/internal/encounters/by-code/${encodeURIComponent(req.params.cid)}`,
      { requestId: req.id }
    );

    if (result.status === 503) {
      res.status(503).json({
        message: 'Consultation service is not available right now. Please retry.',
      });
      return null;
    }

    if (!result.ok) {
      res.status(404).json({ message: 'Consultation not found.' });
      return null;
    }

    const access = await checkAccess(req, {
      patient: result.data.patientId,
      system: label,
      mode,
    });

    if (access.unavailable) {
      res.status(503).json({
        message: 'Identity service is not available right now. Please retry.',
      });
      return null;
    }

    if (!access.allowed) {
      res.status(403).json({
        message: access.reason || 'Not allowed.',
      });
      return null;
    }

    return {
      enc: result.data,
      patient: access.patient,
    };
  }

  let flushing = false;

  async function flushEvents() {
    if (flushing) return;
    flushing = true;

    try {
      const result = await pool.query(
        `SELECT id, type, subject, data
           FROM event_outbox
          WHERE sent = 0 AND attempts < 40
          ORDER BY at
          LIMIT 50`
      );

      for (const event of result.rows) {
        try {
          const response = await fetch(`${SERVICES.bus.url}/publish`, {
            method: 'POST',
            signal: AbortSignal.timeout(5000),
            headers: {
              'Content-Type': 'application/json',
              'X-Service-Token': security.serviceToken(key),
            },
            body: JSON.stringify({
              id: event.id,
              type: event.type,
              source: key,
              subject: event.subject,
              data: event.data || {},
            }),
          });

          if (!response.ok) {
            throw new Error(`Event bus answered ${response.status}`);
          }

          await pool.query(
            'UPDATE event_outbox SET sent = 1 WHERE id = $1',
            [event.id]
          );
        } catch (err) {
          await pool.query(
            `UPDATE event_outbox
                SET attempts = attempts + 1, last_error = $1
              WHERE id = $2`,
            [String(err.message).slice(0, 200), event.id]
          );

          break;
        }
      }
    } catch (err) {
      console.error('[yoga] Event outbox error:', err.message);
    } finally {
      flushing = false;
    }
  }

  async function subscribeEvents(name, url, types) {
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await fetch(`${SERVICES.bus.url}/subscribe`, {
          method: 'POST',
          signal: AbortSignal.timeout(4000),
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Token': security.serviceToken(key),
          },
          body: JSON.stringify({ name, url, types }),
        });

        if (response.ok) {
          console.log('[yoga] Event subscription registered.');
          return true;
        }
      } catch (err) {
        // The shared event bus may still be starting.
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.error('[yoga] Could not register with the event bus.');
    return false;
  }

  const events = {
    async publish(type, subject, data = {}) {
      const id = crypto.randomUUID();

      await pool.query(
        `INSERT INTO event_outbox (id, type, subject, data, at)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [
          id,
          type,
          subject == null ? null : String(subject),
          JSON.stringify(data),
          new Date().toISOString(),
        ]
      );

      setImmediate(flushEvents);
      return id;
    },

    handler(fn) {
      return asyncRoute(async (req, res) => {
        const event = req.body || {};

        if (!event.id || !event.type) {
          return res.status(400).json({ message: 'Invalid event.' });
        }

        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          const inserted = await client.query(
            `INSERT INTO processed_events (id, type, at)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO NOTHING
             RETURNING id`,
            [event.id, event.type, new Date().toISOString()]
          );

          if (!inserted.rowCount) {
            await client.query('COMMIT');
            return res.json({ ok: true, duplicate: true });
          }

          await fn(event, client);

          await client.query('COMMIT');
          return res.json({ ok: true });
        } catch (err) {
          await client.query('ROLLBACK');
          console.error('[yoga] Event handler error:', err.message);

          return res.status(500).json({
            message: 'Event handling failed; the bus will retry.',
          });
        } finally {
          client.release();
        }
      });
    },

    subscribe: subscribeEvents,
  };

  // Form definitions
  app.get('/forms', authenticate, (req, res) => {
    res.json({
      system: label,
      key,
      parts: parts.map(
        ({ id, label: partLabel, practitionerOnly, fields, help }) => ({
          id,
          label: partLabel,
          practitionerOnly: !!practitionerOnly,
          fields,
          help: help || null,
        })
      ),
    });
  });

  // Consultation summary
  app.get(
    '/consultations/:cid/summary',
    authenticate,
    asyncRoute(async (req, res) => {
      const access = await open(req, res, 'read');
      if (!access) return;

      const entries = await Promise.all(
        parts.map(async (part) => [
          part.id,
          await latest(req.params.cid, part.id),
        ])
      );

      res.json(Object.fromEntries(entries));
    })
  );

  // Version history
  app.get(
    '/consultations/:cid/:part/versions',
    authenticate,
    asyncRoute(async (req, res) => {
      const part = req.params.part;

      if (!partById[part]) {
        return res.status(404).json({ message: 'Unknown form.' });
      }

      const access = await open(req, res, 'read');
      if (!access) return;

      const result = await pool.query(
        `SELECT version,
                saved_by AS "savedBy",
                saved_role AS "savedRole",
                saved_at AS "savedAt"
           FROM ${T}
          WHERE consultation_code = $1 AND part = $2
          ORDER BY version DESC`,
        [req.params.cid, part]
      );

      res.json(result.rows);
    })
  );

  // Read one form
  app.get(
    '/consultations/:cid/:part',
    authenticate,
    asyncRoute(async (req, res) => {
      const part = req.params.part;

      if (!partById[part]) {
        return res.status(404).json({ message: 'Unknown form.' });
      }

      const access = await open(req, res, 'read');
      if (!access) return;

      const data = await latest(req.params.cid, part);

      if (!data) {
        return res.status(404).json({ message: 'Nothing saved yet.' });
      }

      res.json(data);
    })
  );

  // Save a form
  app.post(
    '/consultations/:cid/:part',
    authenticate,
    asyncRoute(async (req, res) => {
      const { cid, part } = req.params;
      const definition = partById[part];

      if (!definition) {
        return res.status(404).json({ message: 'Unknown form.' });
      }

      if (
        definition.practitionerOnly &&
        req.user.role !== 'practitioner'
      ) {
        return forbid(res, 'Only a practitioner can record this part.');
      }

      const body = req.body;

      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        !Object.keys(body).length
      ) {
        return res.status(400).json({ message: 'Nothing to save.' });
      }

      const errors = strict
        ? validateFields(definition.fields, body)
        : {};

      if (Object.keys(errors).length) {
        return invalid(res, errors);
      }

      const access = await open(req, res, 'write');
      if (!access) return;

      const idempotencyKey = req.get('Idempotency-Key');
      const route = `${cid}/${part}`;
      const savedAt = new Date().toISOString();

      const savedBy =
        req.user.role === 'practitioner'
          ? req.user.code
          : req.user.role;

      const client = await pool.connect();

      let output;

      try {
        await client.query('BEGIN');

        await client.query(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          [`yoga:${cid}:${part}`]
        );

        if (idempotencyKey) {
          await client.query(
            'SELECT pg_advisory_xact_lock(hashtext($1))',
            [`yoga-idem:${idempotencyKey}:${route}`]
          );

          const previous = await client.query(
            `SELECT status, response
               FROM idempotency
              WHERE key = $1 AND route = $2`,
            [idempotencyKey, route]
          );

          if (previous.rows.length) {
            const old = previous.rows[0];
            await client.query('COMMIT');
            return res.status(old.status).json(old.response);
          }
        }

        const lastResult = await client.query(
          `SELECT COALESCE(MAX(version), 0) AS version
             FROM ${T}
            WHERE consultation_code = $1 AND part = $2`,
          [cid, part]
        );

        const version = Number(lastResult.rows[0].version) + 1;

        await client.query(
          `INSERT INTO ${T}
            (consultation_code, patient_id, encounter_id, part, version,
             data, saved_by, saved_role, saved_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
          [
            cid,
            access.enc.patientId,
            access.enc.encounterId,
            part,
            version,
            JSON.stringify(body),
            savedBy,
            req.user.role,
            savedAt,
          ]
        );

        const summary = definition.summary
          ? definition.summary(body)
          : {};

        const assessedBy =
          req.user.role === 'practitioner'
            ? req.user.code
            : null;

        await client.query(
          `INSERT INTO ${A}
            (assessment_id, patient_id, encounter_id, consultation_code,
             summary, assessed_by, assessed_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
           ON CONFLICT (encounter_id)
           DO UPDATE SET
             summary = ${A}.summary || EXCLUDED.summary,
             assessed_by = COALESCE(EXCLUDED.assessed_by, ${A}.assessed_by),
             assessed_at = EXCLUDED.assessed_at`,
          [
            crypto.randomUUID(),
            access.enc.patientId,
            access.enc.encounterId,
            cid,
            JSON.stringify(summary),
            assessedBy,
            savedAt,
          ]
        );

        const eventData = {
          patientId: access.enc.patientId,
          healthId: access.patient.healthId,
          encounterId: access.enc.encounterId,
          consultationCode: cid,
          system: label,
          part,
          partLabel: definition.label,
          version,
          doctor: assessedBy,
          savedBy,
          savedAt,
          title: `${label}: ${definition.label}`,
          text: definition.brief
            ? definition.brief(body)
            : Object.values(body)
                .filter((v) => typeof v === 'string' && v)
                .slice(0, 2)
                .join(' | ')
                .slice(0, 200),
          diagnosisNote:
            part === 'diagnosis'
              ? [str(body.diagnosis), str(body.notes)]
                  .filter(Boolean)
                  .join('\n') || null
              : null,
        };

        // Outbox row is committed together with the clinical record.
        await client.query(
          `INSERT INTO event_outbox (id, type, subject, data, at)
           VALUES ($1, $2, $3, $4::jsonb, $5)`,
          [
            crypto.randomUUID(),
            EVENTS.ASSESSMENT_SAVED,
            access.enc.patientId,
            JSON.stringify(eventData),
            savedAt,
          ]
        );

        output = {
          ok: true,
          consultationId: cid,
          version,
          savedAt,
        };

        if (idempotencyKey) {
          await client.query(
            `INSERT INTO idempotency (key, route, status, response)
             VALUES ($1, $2, $3, $4::jsonb)
             ON CONFLICT (key, route) DO NOTHING`,
            [idempotencyKey, route, 201, JSON.stringify(output)]
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      audit(req, {
        action: 'FORM_SAVED',
        type: `${key}.${part}`,
        ref: cid,
      });

      setImmediate(flushEvents);
      res.status(201).json(output);
    })
  );

  // Internal endpoints used by trusted AYUSH services.
  const internal = require('express').Router();
  internal.use(serviceOnly);

  internal.get(
    '/patients/:pid/assessments',
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `SELECT consultation_code AS "consultationCode",
                summary,
                assessed_by AS "assessedBy",
                assessed_at AS "assessedAt"
           FROM ${A}
          WHERE patient_id = $1`,
        [req.params.pid]
      );

      res.json(result.rows);
    })
  );

  internal.delete(
    '/patients/:pid',
    asyncRoute(async (req, res) => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        await client.query(
          `DELETE FROM ${T} WHERE patient_id = $1`,
          [req.params.pid]
        );

        await client.query(
          `DELETE FROM ${A} WHERE patient_id = $1`,
          [req.params.pid]
        );

        await client.query('COMMIT');
        res.json({ deleted: true });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    })
  );

  internal.post(
    '/events',
    events.handler(async (event, client) => {
      if (
        event.type === EVENTS.PATIENT_DELETED &&
        event.data?.patientId
      ) {
        await client.query(
          `DELETE FROM ${T} WHERE patient_id = $1`,
          [event.data.patientId]
        );

        await client.query(
          `DELETE FROM ${A} WHERE patient_id = $1`,
          [event.data.patientId]
        );
      }
    })
  );

  app.use('/internal', internal);

  finish(app, key);

  async function start() {
    await pool.query('SELECT 1');

    console.log('[yoga] Supabase PostgreSQL connection successful.');

    listen(app, key);

    const timer = setInterval(flushEvents, 2000);
    timer.unref();

    events.subscribe(
      key,
      `${SERVICES[key].url}/internal/events`,
      [EVENTS.PATIENT_DELETED]
    );
  }

  start().catch((err) => {
    console.error(
      '[yoga] Startup failed. Check Yoga database configuration and connectivity.'
    );
    console.error(err.message);
    process.exit(1);
  });

  return {
    app,
    pool,
    T,
    label,
    key,
    latest,
    open,
    events,
    partById,
  };
};
