import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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

const getAllFeatureKeys = () => {
  const toggles: Record<string, boolean> = {};
  Object.values(featureConfig).forEach((portal) => {
    Object.keys(portal).forEach((key) => {
      toggles[key] = true;
    });
  });
  return toggles;
};

async function main() {
  console.log(`🌱 Starting comprehensive database seed...`);

  // 1. Upsert System Settings
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
  console.log(`✅ System settings created: ${settings.id}`);

  // 2. Create Users first (with hashed passwords)
  const hashedPassword = await bcrypt.hash("principal123", 10);
  const hashedAdminPass = await bcrypt.hash("admin123", 10);
  const hashedSuperAdminPass = await bcrypt.hash("superadmin123", 10);
  const hashedRegistrarPass = await bcrypt.hash("registrar123", 10);
  const hashedTeacherPass = await bcrypt.hash("teacher123", 10);
  const hashedStudentPass = await bcrypt.hash("student123", 10);
  const hashedParentPass = await bcrypt.hash("parent123", 10);
  const hashedLibrarianPass = await bcrypt.hash("librarian123", 10);

  await prisma.user.upsert({
    where: { id: "superadmin" },
    update: {},
    create: {
      id: "superadmin",
      userId: "superadmin",
      name: "Super Admin",
      email: "superadmin@verticx.com",
      role: "SuperAdmin",
      passwordHash: hashedSuperAdminPass,
      phone: "9876543210",
      status: "active",
    },
  });

  await prisma.user.upsert({
    where: { id: "admin-1" },
    update: {},
    create: {
      id: "admin-1",
      userId: "admin@verticx.com",
      name: "Admin User",
      email: "admin@verticx.com",
      role: "Admin",
      passwordHash: hashedAdminPass,
      status: "active",
    },
  });

  await prisma.user.upsert({
    where: { id: "principal-1" },
    update: {},
    create: {
      id: "principal-1",
      userId: "principal.north@verticx.com",
      name: "Dr. Evelyn Reed",
      email: "principal.north@verticx.com",
      role: "Principal",
      passwordHash: hashedPassword,
      phone: "9876543211",
      salary: 120000,
      status: "active",
    },
  });

  await prisma.user.upsert({
    where: { id: "principal-2" },
    update: {},
    create: {
      id: "principal-2",
      userId: "principal.south@verticx.com",
      name: "Mr. Alan Grant",
      email: "principal.south@verticx.com",
      role: "Principal",
      passwordHash: hashedPassword,
      phone: "9876543212",
      salary: 115000,
      status: "active",
    },
  });

  await prisma.user.upsert({
    where: { id: "VRTX-REG-001" },
    update: {},
    create: {
      id: "VRTX-REG-001",
      userId: "VRTX-REG-001",
      name: "Robert Muldoon",
      email: "registrar.north@verticx.com",
      role: "Registrar",
      passwordHash: hashedRegistrarPass,
      salary: 60000,
      status: "active",
    },
  });

  await prisma.user.upsert({
    where: { id: "VRTX-LIB-001" },
    update: {},
    create: {
      id: "VRTX-LIB-001",
      userId: "VRTX-LIB-001",
      name: "Barbara Gordon",
      email: "librarian.north@verticx.com",
      role: "Librarian",
      passwordHash: hashedLibrarianPass,
      salary: 45000,
      status: "active",
    },
  });

  await prisma.user.upsert({
    where: { id: "parent-1" },
    update: {},
    create: {
      id: "parent-1",
      userId: "parent.sarah@verticx.com",
      name: "Sarah Connor",
      email: "parent.sarah@verticx.com",
      role: "Parent",
      passwordHash: hashedParentPass,
      status: "active",
    },
  });

  console.log(`✅ Core users created (7 users)`);

  // 3. Create Branches
  const branchNorth = await prisma.branch.upsert({
    where: { id: "branch-north" },
    update: {},
    create: {
      id: "branch-north",
      registrationId: "SCH-N-01",
      name: "North Branch",
      location: "City North, State",
      principalId: "principal-1",
      status: "active",
      email: "north@verticx.com",
      helplineNumber: "123-456-7890",
      erpPricePerStudent: 10,
      billingCycle: "monthly",
      nextDueDate: new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        10
      ),
      enabledFeatures: getAllFeatureKeys(),
      academicSessionStartDate: new Date("2024-04-01"),
      stats: {
        students: 1,
        teachers: 2,
        staff: 4,
        healthScore: 92.5,
        avgPerformance: 85.0,
        feeDefaulters: 1,
      },
    },
  });

  const branchSouth = await prisma.branch.upsert({
    where: { id: "branch-south" },
    update: {},
    create: {
      id: "branch-south",
      registrationId: "SCH-S-02",
      name: "South Branch",
      location: "City South, State",
      principalId: "principal-2",
      status: "active",
      email: "south@verticx.com",
      helplineNumber: "123-456-7891",
      erpPricePerStudent: 12,
      billingCycle: "monthly",
      nextDueDate: new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        10
      ),
      enabledFeatures: getAllFeatureKeys(),
      academicSessionStartDate: new Date("2024-04-01"),
      stats: {
        students: 0,
        teachers: 0,
        staff: 1,
        healthScore: 95.0,
        avgPerformance: 88.0,
        feeDefaulters: 0,
      },
    },
  });
  console.log(`✅ Branches created: ${branchNorth.name}, ${branchSouth.name}`);

  // 4. Update users with branchId now that branches exist
  await prisma.user.update({
    where: { id: "principal-1" },
    data: { branchId: "branch-north" },
  });

  await prisma.user.update({
    where: { id: "principal-2" },
    data: { branchId: "branch-south" },
  });

  await prisma.user.update({
    where: { id: "VRTX-REG-001" },
    data: { branchId: "branch-north" },
  });

  await prisma.user.update({
    where: { id: "VRTX-LIB-001" },
    data: { branchId: "branch-north" },
  });

  await prisma.user.upsert({
    where: { id: "VRTX-STU-0001" },
    update: {},
    create: {
      id: "VRTX-STU-0001",
      userId: "VRTX-STU-0001",
      name: "Alex Murphy",
      email: "alex.murphy@student.verticx.com",
      role: "Student",
      passwordHash: hashedStudentPass,
      branchId: "branch-north",
      status: "active",
    },
  });

  console.log(`✅ Users updated with branch assignments`);

  // 5. Create User records for teachers
  await prisma.user.upsert({
    where: { id: "VRTX-TCH-001" },
    update: {},
    create: {
      id: "VRTX-TCH-001",
      userId: "VRTX-TCH-001",
      name: "Dr. Ian Malcolm",
      email: "ian.malcolm@verticx.com",
      role: "Teacher",
      passwordHash: hashedTeacherPass,
      branchId: "branch-north",
      salary: 75000,
      status: "active",
    },
  });

  await prisma.user.upsert({
    where: { id: "VRTX-TCH-002" },
    update: {},
    create: {
      id: "VRTX-TCH-002",
      userId: "VRTX-TCH-002",
      name: "Ellie Sattler",
      email: "ellie.sattler@verticx.com",
      role: "Teacher",
      passwordHash: hashedTeacherPass,
      branchId: "branch-north",
      salary: 72000,
      status: "active",
    },
  });

  // 6. Create Teachers
  await prisma.teacher.upsert({
    where: { id: "VRTX-TCH-001" },
    update: {},
    create: {
      id: "VRTX-TCH-001",
      userId: "VRTX-TCH-001",
      branchId: "branch-north",
      name: "Dr. Ian Malcolm",
      subjectIds: ["sub-math-10", "sub-cs-10"],
      qualification: "PhD Mathematics",
      doj: new Date("2020-08-01"),
      gender: "Male",
      email: "ian.malcolm@verticx.com",
      phone: "555-0201",
      status: "active",
      salary: 75000,
      leaveBalances: { sick: 12, casual: 10, earned: 15 },
    },
  });

  await prisma.teacher.upsert({
    where: { id: "VRTX-TCH-002" },
    update: {},
    create: {
      id: "VRTX-TCH-002",
      userId: "VRTX-TCH-002",
      branchId: "branch-north",
      name: "Ellie Sattler",
      subjectIds: ["sub-bio-10"],
      qualification: "PhD Paleobotany",
      doj: new Date("2019-07-15"),
      gender: "Female",
      email: "ellie.sattler@verticx.com",
      phone: "555-0202",
      status: "active",
      salary: 72000,
      leaveBalances: { sick: 12, casual: 10, earned: 15 },
    },
  });

  console.log(`✅ Teachers created (2 teachers)`);

  // 7. Create Fee Templates (needed before class)
  await prisma.feeTemplate.upsert({
    where: { id: "fee-tpl-g10-north" },
    update: {},
    create: {
      id: "fee-tpl-g10-north",
      branchId: "branch-north",
      name: "Grade 10 Standard Fees",
      amount: 120000,
      gradeLevel: 10,
      monthlyBreakdown: Array(12)
        .fill(0)
        .map((_, i) => ({
          month: new Date(0, i).toLocaleString("default", { month: "long" }),
          total: 10000,
          breakdown: [
            { component: "Tuition", amount: 8000 },
            { component: "Misc", amount: 2000 },
          ],
        })),
    },
  });

  console.log(`✅ Fee templates created`);

  // 8. Create School Classes
  await prisma.schoolClass.upsert({
    where: { id: "class-10a-north" },
    update: {},
    create: {
      id: "class-10a-north",
      branchId: "branch-north",
      gradeLevel: 10,
      section: "A",
      mentorId: "VRTX-TCH-001",
      feeTemplateId: "fee-tpl-g10-north",
    },
  });

  console.log(`✅ School classes created (1 class)`);

  // 9. Create Subjects (after class is created)
  await prisma.subject.upsert({
    where: { id: "sub-math-10" },
    update: {},
    create: {
      id: "sub-math-10",
      branchId: "branch-north",
      name: "Mathematics G10",
      teacherId: "VRTX-TCH-001",
      schoolClassId: "class-10a-north",
    },
  });

  await prisma.subject.upsert({
    where: { id: "sub-cs-10" },
    update: {},
    create: {
      id: "sub-cs-10",
      branchId: "branch-north",
      name: "Computer Science G10",
      teacherId: "VRTX-TCH-001",
      schoolClassId: "class-10a-north",
    },
  });

  await prisma.subject.upsert({
    where: { id: "sub-bio-10" },
    update: {},
    create: {
      id: "sub-bio-10",
      branchId: "branch-north",
      name: "Biology G10",
      teacherId: "VRTX-TCH-002",
      schoolClassId: "class-10a-north",
    },
  });

  console.log(`✅ Subjects created (3 subjects)`);

  // 10. Create Students
  await prisma.student.upsert({
    where: { id: "VRTX-STU-0001" },
    update: {},
    create: {
      id: "VRTX-STU-0001",
      userId: "VRTX-STU-0001",
      branchId: "branch-north",
      name: "Alex Murphy",
      gradeLevel: 10,
      parentId: "parent-1",
      classId: "class-10a-north",
      status: "active",
      dob: new Date("2008-05-15"),
      address: "123 Cyber Street",
      gender: "Male",
      guardianInfo: {
        name: "Sarah Connor",
        email: "parent.sarah@verticx.com",
        phone: "555-0101",
      },
      classRollNumber: "10A-01",
      leaveBalances: { sick: 10, planned: 5 },
    },
  });

  console.log(`✅ Students created (1 student)`);

  // 11. Create Courses
  await prisma.course.upsert({
    where: { id: "course-math-10a" },
    update: {},
    create: {
      id: "course-math-10a",
      name: "Mathematics 10A",
      branchId: "branch-north",
      subjectId: "sub-math-10",
      teacherId: "VRTX-TCH-001",
    },
  });

  console.log(`✅ Courses created`);

  // 12. Create Fee Records
  await prisma.feeRecord.upsert({
    where: { id: "fee-record-1" },
    update: {},
    create: {
      id: "fee-record-1",
      studentId: "VRTX-STU-0001",
      totalAmount: 120000,
      paidAmount: 80000,
      dueDate: new Date("2025-03-10"),
      previousSessionDues: 5000,
    },
  });

  console.log(`✅ Fee records created`);

  // 13. Create ERP Payment
  await prisma.erpPayment.upsert({
    where: { id: "erp-pay-1" },
    update: {},
    create: {
      id: "erp-pay-1",
      branchId: "branch-north",
      amount: 10,
      paymentDate: new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        5
      ),
      transactionId: "VRTX-ERP-MOCK-001",
    },
  });

  console.log(`✅ ERP payments created`);

  // 14. Create School Events (including pending ones for testing)
  const today = new Date();
  const futureDate1 = new Date(today);
  futureDate1.setDate(today.getDate() + 15);
  
  const futureDate2 = new Date(today);
  futureDate2.setDate(today.getDate() + 7);
  
  const futureDate3 = new Date(today);
  futureDate3.setDate(today.getDate() + 30);

  await prisma.schoolEvent.upsert({
    where: { id: "event-test-1" },
    update: {},
    create: {
      id: "event-test-1",
      branchId: "branch-north",
      name: "Annual Sports Day",
      date: futureDate1,
      description: "Annual sports competition for all grades",
      location: "School Playground",
      category: "Sports",
      audience: ["Students", "Parents"],
      createdBy: "VRTX-REG-001",
      status: "Pending",
    },
  });

  await prisma.schoolEvent.upsert({
    where: { id: "event-test-2" },
    update: {},
    create: {
      id: "event-test-2",
      branchId: "branch-north",
      name: "Parent-Teacher Meeting",
      date: futureDate2,
      description: "Quarterly parent-teacher interaction",
      location: "School Auditorium",
      category: "Meeting",
      audience: ["Parents", "Staff"],
      createdBy: "VRTX-REG-001",
      status: "Pending",
    },
  });

  await prisma.schoolEvent.upsert({
    where: { id: "event-test-3" },
    update: {},
    create: {
      id: "event-test-3",
      branchId: "branch-north",
      name: "Science Fair",
      date: futureDate3,
      description: "Student science project exhibition",
      location: "Science Lab Block",
      category: "Academic",
      audience: ["All"],
      createdBy: "principal-1",
      status: "Approved",
    },
  });

  console.log(`✅ School events created (3 events - 2 pending, 1 approved)`);

  console.log(`\n🎉 Seeding completed successfully!`);
  console.log(`\n📝 Demo Credentials:`);
  console.log(`   SuperAdmin: superadmin@verticx.com / superadmin123`);
  console.log(`   Admin: admin@verticx.com / admin123`);
  console.log(`   Principal: principal.north@verticx.com / principal123`);
  console.log(`   Registrar: VRTX-REG-001 / registrar123`);
  console.log(`   Teacher: VRTX-TCH-001 / teacher123`);
  console.log(`   Student: VRTX-STU-0001 / student123`);
  console.log(`   Parent: parent.sarah@verticx.com / parent123`);
  console.log(`   Librarian: VRTX-LIB-001 / librarian123`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
