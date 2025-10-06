import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The complete blueprint of all features in your kingdom.
const featureConfig = {
  "Principal Portal": {
    principal_students: true,
    principal_faculty: true,
    principal_classes: true,
    principal_finance: true,
    principal_attendance: true,
    principal_results: true,
    principal_staff_requests: true,
    principal_grievances: true,
    principal_complaints: true,
    principal_events: true,
    principal_communication: true,
    principal_reports: true,
    principal_profile: true,
  },
  "Registrar Portal": {
    registrar_admissions: true,
    registrar_academic_requests: true,
    registrar_students: true,
    registrar_faculty: true,
    registrar_classes: true,
    registrar_fees: true,
    registrar_attendance: true,
    registrar_timetable: true,
    registrar_library: true,
    registrar_hostel: true,
    registrar_transport: true,
    registrar_inventory: true,
    registrar_documents: true,
    registrar_events: true,
    registrar_reports: true,
    registrar_communication: true,
    registrar_bulk_movement: true,
  },
  "Teacher Portal": {
    teacher_attendance: true,
    teacher_gradebook: true,
    teacher_quizzes: true,
    teacher_syllabus: true,
    teacher_content: true,
  },
  "Student Portal": {
    student_syllabus: true,
    student_content: true,
    student_assignments: true,
    student_grades: true,
    student_attendance: true,
    student_feedback: true,
    student_complaints: true,
    student_ask_ai: true,
  },
  "Parent Portal": {
    parent_academics: true,
    parent_fees: true,
    parent_complaints: true,
    parent_contact_teacher: true,
  },
  "Financial Features": {
    online_payments_enabled: true,
    erp_billing_enabled: true,
  },
};

// A helper to flatten the blueprint into the required JSON structure.
const getAllFeatureKeys = () => {
  const toggles: Record<string, boolean> = {};
  Object.values(featureConfig).forEach((portal) => {
    Object.keys(portal).forEach((key) => {
      toggles[key] = true; // All features are enabled by default.
    });
  });
  return toggles;
};

async function main() {
  console.log(`Start seeding ...`);

  // This 'upsert' command is idempotent. It will create the 'global' record if it
  // doesn't exist, or do nothing if it already exists. This is safe to run on every deploy.
  const settings = await prisma.systemSettings.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      defaultErpPrice: 500,
      globalFeatureToggles: getAllFeatureKeys(),
      loginPageAnnouncement: "Welcome to the Verticx ERP System.",
    },
  });

  console.log(
    `Seeding finished. Global settings are present with ID: ${settings.id}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
