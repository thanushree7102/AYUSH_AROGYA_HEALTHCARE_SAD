// Idempotent shared demo seed. Siddha demo doctor: 9000000003 (D-SID-1). The other AYUSH demo doctors are kept so a shared database stays compatible.
const { db, uuid, now } = require('./context');

module.exports = function seed() {
  const t = now();

  // One neutral demo facility supports both connected services.
  let facility = db.prepare("SELECT * FROM facilities WHERE facility_code = 'F-1'").get();
  if (!facility) {
    const fid = uuid();
    db.prepare(`INSERT INTO facilities (facility_id,facility_code,legal_name,display_name,facility_type,ownership_type,official_phone,official_email,facility_status,created_at)
                VALUES (?, 'F-1','Demo AYUSH Wellness Centre','Demo AYUSH Wellness Centre','Clinic','Private','9000000005','clinic@demo.in','Approved',?)`).run(fid, t);
    db.prepare(`INSERT INTO facility_addresses (facility_address_id,facility_id,address_line,city,state) VALUES (?,?,?,?,?)`).run(uuid(), fid, 'MG Road', 'Bengaluru', 'Karnataka');
    db.prepare(`INSERT INTO facility_registrations (facility_registration_id,facility_id,registration_number,verification_status) VALUES (?,?, 'CL-001','Verified')`).run(uuid(), fid);
    db.prepare(`INSERT INTO user_accounts (user_id,mobile_number,account_type,linked_profile_id,created_at) VALUES (?, '9000000005','Facility Representative',?,?)`).run(uuid(), fid, t);
    facility = db.prepare("SELECT * FROM facilities WHERE facility_code = 'F-1'").get();
  } else {
    db.prepare("UPDATE facilities SET legal_name=?, display_name=?, facility_status='Approved' WHERE facility_code='F-1'")
      .run('Demo AYUSH Wellness Centre', 'Demo AYUSH Wellness Centre');
  }

  const services = [
    ['Ayurveda', 'Ayurveda consultation'],
    ['Yoga & Naturopathy', 'Yoga & Naturopathy consultation'],
    ['Siddha', 'Siddha consultation'],
    ['Unani', 'Unani consultation'],
  ];
  for (const [system, serviceName] of services) {
    if (!db.prepare('SELECT 1 FROM facility_services WHERE facility_id=? AND ayush_system=?').get(facility.facility_id, system)) {
      db.prepare('INSERT INTO facility_services (facility_service_id,facility_id,ayush_system,service_name) VALUES (?,?,?,?)')
        .run(uuid(), facility.facility_id, system, serviceName);
    }
  }

  const ensureDoctor = ({ code, name, system, mobile, email, registration, council, degree }) => {
    let d = db.prepare('SELECT * FROM doctors WHERE doctor_code=?').get(code);
    if (!d && code === 'D-AYU-1') {
      // Upgrade a legacy single-domain D-1 demo doctor without losing its linked account.
      const legacy = db.prepare("SELECT * FROM doctors WHERE doctor_code='D-1'").get();
      if (legacy) {
        db.prepare('UPDATE doctors SET doctor_code=?, full_name=?, mobile_number=?, professional_email=?, ayush_system=?, profile_status=? WHERE doctor_id=?')
          .run(code, name, mobile, email, system, 'Approved', legacy.doctor_id);
        db.prepare('UPDATE user_accounts SET mobile_number=? WHERE linked_profile_id=? AND account_type=?')
          .run(mobile, legacy.doctor_id, 'Doctor');
        d = db.prepare('SELECT * FROM doctors WHERE doctor_code=?').get(code);
      }
    }
    if (!d) {
      const id = uuid();
      db.prepare(`INSERT INTO doctors (doctor_id,doctor_code,full_name,mobile_number,professional_email,ayush_system,profile_status,created_at)
                  VALUES (?,?,?,?,?,?, 'Approved', ?)`).run(id, code, name, mobile, email, system, t);
      d = db.prepare('SELECT * FROM doctors WHERE doctor_code=?').get(code);
    } else {
      db.prepare("UPDATE doctors SET full_name=?, mobile_number=?, professional_email=?, ayush_system=?, profile_status='Approved' WHERE doctor_id=?")
        .run(name, mobile, email, system, d.doctor_id);
      d = db.prepare('SELECT * FROM doctors WHERE doctor_code=?').get(code);
    }

    if (!db.prepare('SELECT 1 FROM doctor_qualifications WHERE doctor_id=?').get(d.doctor_id)) {
      db.prepare(`INSERT INTO doctor_qualifications (qualification_id,doctor_id,degree_name,verification_status) VALUES (?,?,?, 'Verified')`)
        .run(uuid(), d.doctor_id, degree);
    }
    if (!db.prepare('SELECT 1 FROM doctor_registrations WHERE doctor_id=?').get(d.doctor_id)) {
      db.prepare(`INSERT INTO doctor_registrations (registration_id,doctor_id,registration_number,council_authority,registration_category,verification_status)
                  VALUES (?,?,?,?,?, 'Verified')`).run(uuid(), d.doctor_id, registration, council, system);
    }
    if (!db.prepare('SELECT 1 FROM doctor_specializations WHERE doctor_id=?').get(d.doctor_id)) {
      db.prepare(`INSERT INTO doctor_specializations (doctor_specialization_id,doctor_id,specialization_name,verification_status) VALUES (?,?,?, 'Not Required')`)
        .run(uuid(), d.doctor_id, system);
    }
    if (!db.prepare("SELECT 1 FROM user_accounts WHERE linked_profile_id=? AND account_type='Doctor'").get(d.doctor_id)) {
      const byMobile = db.prepare("SELECT 1 FROM user_accounts WHERE mobile_number=? AND account_type='Doctor'").get(mobile);
      if (!byMobile) db.prepare(`INSERT INTO user_accounts (user_id,mobile_number,account_type,linked_profile_id,created_at) VALUES (?,?, 'Doctor', ?, ?)`)
        .run(uuid(), mobile, d.doctor_id, t);
    }
    if (!db.prepare('SELECT 1 FROM facility_doctors WHERE facility_id=? AND doctor_reference_id=?').get(facility.facility_id, d.doctor_id)) {
      db.prepare(`INSERT INTO facility_doctors (facility_doctor_id,facility_id,doctor_reference_id,association_type,association_status,start_date)
                  VALUES (?,?,?, 'Employee','Active',?)`).run(uuid(), facility.facility_id, d.doctor_id, t.slice(0, 10));
    }
  };

  ensureDoctor({ code: 'D-AYU-1', name: 'Dr. Ayurveda Demo', system: 'Ayurveda', mobile: '9000000001', email: 'ayurveda.demo@demo.in', registration: 'AYU-DEMO-001', council: 'NCISM', degree: 'BAMS' });
  ensureDoctor({ code: 'D-YOGA-1', name: 'Dr. Yoga Demo', system: 'Yoga & Naturopathy', mobile: '9000000002', email: 'yoga.demo@demo.in', registration: 'YOGA-DEMO-001', council: 'Yoga Council', degree: 'Yoga Therapy' });
  ensureDoctor({ code: 'D-UNA-1', name: 'Dr. Unani Demo', system: 'Unani', mobile: '9000000004', email: 'unani.demo@demo.in', registration: 'UNA-DEMO-001', council: 'NCISM', degree: 'BUMS' });
  ensureDoctor({ code: 'D-SID-1', name: 'Dr. Siddha Demo', system: 'Siddha', mobile: '9000000003', email: 'siddha.demo@demo.in', registration: 'SID-DEMO-001', council: 'NCISM', degree: 'BSMS' });

  // Create the demo admin/auditor only once; both apps share these accounts.
  if (db.prepare('SELECT COUNT(*) c FROM admin_profiles').get().c === 0) {
    const admins = [['A-1', 'Demo Administrator', '9000000009', 'admin@demo.in', 'Super Admin'], ['A-2', 'Demo Auditor', '9000000008', 'auditor@demo.in', 'Auditor']];
    for (const [code, name, mob, email, role] of admins) {
      const uid = uuid(); const aid = uuid();
      db.prepare(`INSERT INTO user_accounts (user_id,mobile_number,account_type,linked_profile_id,created_at) VALUES (?,?, 'Admin', ?, ?)`).run(uid, mob, aid, t);
      db.prepare(`INSERT INTO admin_profiles (admin_id,admin_code,user_id,full_name,official_email,work_phone,designation,activation_date) VALUES (?,?,?,?,?,?,?,?)`)
        .run(aid, code, uid, name, email, mob, role, t.slice(0, 10));
      db.prepare(`INSERT INTO user_role_assignments (user_role_id,user_id,role_id,assigned_at) VALUES (?,?,(SELECT role_id FROM roles WHERE role_name=?),?)`)
        .run(uuid(), uid, role, t);
    }
  }
};
