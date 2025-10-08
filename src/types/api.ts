/**
 * @file verticx-backend/src/types/api.ts
 * @description Centralized TypeScript types for the Verticx backend API.
 * This file is a direct mirror of the frontend's `types.ts` to ensure
 * data consistency and type safety across the entire application stack.
 * Maintain strict synchronization between this file and its frontend counterpart.
 */

// =================================================================
// 1. CORE & USER-RELATED TYPES
// =================================================================
export type UserRole = 'Admin' | 'Principal' | 'Registrar' | 'Teacher' | 'Student' | 'Parent' | 'Librarian' | 'SuperAdmin' | 'SupportStaff';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  password?: string; // Should be stripped from all API responses
  branchId?: string;
  status?: 'active' | 'suspended';
  phone?: string;
  designation?: string;
  childrenIds?: string[];
  currentOtp?: string;
  profileAccessOtp?: string;
  leaveBalances?: {
    [key: string]: number;
    sick: number;
    casual: number;
  };
  salary?: number;
}

export interface Parent {
  id: string;
  name: string;
  childrenIds: string[];
}

export interface Teacher {
  id: string;
  branchId: string;
  name: string;
  subjectIds: string[];
  qualification: string;
  doj: string;
  gender: 'Male' | 'Female' | 'Other';
  email: string;
  phone?: string;
  status: 'active' | 'suspended';
  salary?: number;
  complaintCount?: number;
  rectificationRequestCount?: number;
  transportInfo?: {
      routeId: string;
      stopId: string;
  };
  leaveBalances: {
    sick: number;
    casual: number;
    earned: number;
  };
}

export interface Student {
  id: string;
  branchId: string;
  name: string;
  gradeLevel: number;
  parentId: string;
  classId?: string;
  roomId?: string;
  transportInfo?: {
      routeId: string;
      stopId: string;
  };
  status: 'active' | 'suspended' | 'inactive';
  dob: string;
  address: string;
  gender?: 'Male' | 'Female' | 'Other';
  guardianInfo: {
    name: string;
    email: string;
    phone: string;
  };
  schoolRank?: number;
  rollNo?: string;
  profilePictureUrl?: string;
  mentorTeacherId?: string;
  leaveBalances: {
    sick: number;
    planned: number;
  };
}

export interface Branch {
  id: string;
  registrationId: string;
  name: string;
  location: string;
  principalId: string;
  registrarId?: string;
  status: 'active' | 'pending' | 'suspended';
  email?: string;
  helplineNumber?: string;
  vicePrincipalName?: string;
  logoUrl?: string;
  principalPhotoUrl?: string;
  vicePrincipalPhotoUrl?: string;
  erpPricePerStudent?: number;
  erpConcessionPercentage?: number;
  billingCycle?: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  nextDueDate?: string;
  enabledFeatures: Record<string, boolean>;
  academicSessionStartDate?: string;
  bankAccountNumber?: string;
  bankIfscCode?: string;
  bankAccountHolderName?: string;
  bankBranchName?: string;
  paymentGatewayPublicKey?: string;
  paymentGatewaySecretKey?: string;
  paymentGatewayWebhookSecret?: string;
  stats: {
    students: number;
    teachers: number;
    staff: number;
    healthScore: number;
    avgPerformance: number;
    feeDefaulters: number;
    attendancePercentage?: number;
  };
}

// =================================================================
// 2. ACADEMIC & SCHOOL STRUCTURE TYPES
// =================================================================
export interface Subject {
  id: string;
  branchId: string;
  name: string;
  teacherId?: string;
}

export interface SchoolClass {
  id: string;
  branchId: string;
  gradeLevel: number;
  section: string;
  subjectIds: string[];
  studentIds: string[];
  mentorTeacherId?: string;
  feeTemplateId?: string;
}

export interface Course {
  id: string;
  name: string;
  branchId: string;
  subjectId: string;
  teacherId: string;
}

export interface Grade {
  studentId: string;
  courseId: string;
  assessment: string;
  score: number;
  term: string;
}

export interface GradeWithCourse extends Grade {
  courseName: string;
}

export interface Assignment {
  id: string;
  courseId: string;
  classId: string;
  teacherId: string;
  title: string;
  description?: string;
  dueDate: Date;
  courseName?: string;
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Tardy';

export interface AttendanceRecord {
  studentId: string;
  courseId: string;
  date: string;
  status: AttendanceStatus;
  classId?: string;
}

export interface AttendanceListItem {
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
  rollNo?: string;
  schoolRank?: number;
}

export type TeacherAttendanceStatus = 'Present' | 'Absent' | 'On Leave' | 'Half Day';

export interface TeacherAttendanceRecord {
  id: string;
  branchId: string;
  teacherId: string;
  date: string;
  status: TeacherAttendanceStatus;
  notes?: string;
}

export interface TeacherAttendanceListItem {
    teacherId: string;
    teacherName: string;
    status: TeacherAttendanceStatus;
}

export interface Lecture {
    id: string;
    branchId: string;
    classId: string;
    subjectId: string;
    teacherId: string;
    topic: string;
    scheduledDate: string;
    status: 'pending' | 'completed';
}

export interface Examination {
    id: string;
    branchId: string;
    name: string;
    startDate: string;
    endDate: string;
    status: 'Upcoming' | 'Ongoing' | 'Completed';
    resultStatus: 'Pending' | 'Published';
}

export interface ExamSchedule {
    id: string;
    examinationId: string;
    branchId: string;
    classId: string;
    subjectId: string;
    date: string;
    startTime: string;
    endTime: string;
    room: string;
    totalMarks: number;
}

export interface ExamMark {
    id: string;
    branchId: string;
    examinationId: string;
    examScheduleId: string;
    studentId: string;
    teacherId: string;
    score: number;
    totalMarks: number;
    enteredAt: Date;
}

export interface MarkingTemplate {
  id: string;
  teacherId: string;
  courseId: string;
  name: string;
  totalMarks: number;
  weightage: number;
}

export interface StudentMark {
  id: string;
  studentId: string;
  templateId: string;
  marksObtained: number;
}


// =================================================================
// 3. FINANCIAL TYPES
// =================================================================
export interface FeeComponent {
  component: string;
  amount: number;
}

export interface MonthlyFee {
  month: string;
  total: number;
  breakdown: FeeComponent[];
}

export interface FeeTemplate {
  id: string;
  branchId: string;
  name: string;
  amount: number;
  gradeLevel: number;
  monthlyBreakdown?: MonthlyFee[];
}

export interface FeeRecord {
  studentId: string;
  totalAmount: number;
  paidAmount: number;
  dueDate: Date;
  previousSessionDues?: number;
}

export interface FeePayment {
    id: string;
    studentId: string;
    amount: number;
    paidDate: string;
    transactionId: string;
    details?: string;
}

export interface FeeAdjustment {
    id: string;
    studentId: string;
    amount: number;
    type: 'concession' | 'charge';
    reason: string;
    adjustedBy: string;
    date: string;
}

export type FeeHistoryItem = FeePayment | FeeAdjustment;

export interface ManualExpense {
  id: string;
  branchId: string;
  description: string;
  category: 'Utilities' | 'Supplies' | 'Maintenance' | 'Events' | 'Miscellaneous';
  amount: number;
  date: string;
  enteredBy: string;
}

export interface ManualSalaryAdjustment {
  id: string;
  branchId: string;
  staffId: string;
  month: string;
  amount: number;
  reason: string;
  adjustedBy: string;
  adjustedAt: Date;
}

export interface PayrollRecord {
  id: string;
  branchId: string;
  staffId: string;
  staffName: string;
  staffRole: UserRole;
  month: string;
  baseSalary: number | null;
  unpaidLeaveDays: number;
  leaveDeductions: number | null;
  manualAdjustmentsTotal: number;
  netPayable: number | null;
  status: 'Pending' | 'Paid' | 'Salary Not Set';
  paidAt?: Date;
  paidBy?: string;
}

export type PayrollStaffDetails = PayrollRecord;

export interface MonthlyDue {
  month: string;
  year: number;
  total: number;
  paid: number;
  balance: number;
  status: 'Paid' | 'Partially Paid' | 'Due';
}

export interface ErpPayment {
    id: string;
    branchId: string;
    amount: number;
    paymentDate: string;
    transactionId: string;
}

export interface ErpFinancials {
    totalBilled: number;
    totalPaid: number;
    pendingAmount: number;
    collectionRate: number;
    billingHistory: { month: string; amountBilled: number; amountPaid: number }[];
    paymentHistory: ErpPayment[];
}


// =================================================================
// 4. REQUESTS & APPLICATIONS
// =================================================================
export interface RegistrationRequest {
  id: string;
  schoolName: string;
  registrationId: string;
  principalName: string;
  email: string;
  phone: string;
  location: string;
  submittedAt: Date;
  status?: 'pending' | 'approved' | 'denied';
}

export interface Application {
    id: string;
    branchId: string;
    applicantName: string;
    type: 'Student' | 'Teacher';
    grade?: number;
    subject?: string;
    email: string;
    status: 'pending' | 'approved' | 'denied';
    documents: any[];
}

export interface FacultyApplication {
  id: string;
  branchId: string;
  name: string;
  qualification: string;
  doj: string;
  gender: 'Male' | 'Female' | 'Other';
  email?: string;
  phone?: string;
  subjectIds: string[];
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: Date;
  submittedBy: string;
  reviewedBy?: string;
  reviewedAt?: Date;
}

export type LeaveType = 'Sick' | 'Casual' | 'Earned' | 'Planned';

export interface LeaveApplication {
    id: string;
    branchId: string;
    applicantId: string;
    applicantName: string;
    applicantRole: UserRole;
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    isHalfDay: boolean;
    reason: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    reviewedBy?: string;
    reviewedAt?: Date;
}

export interface ConcessionRequest {
  id: string;
  branchId: string;
  studentId: string;
  amount: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedBy: string;
}

export interface RectificationRequest {
    id: string;
    branchId: string;
    teacherId: string;
    teacherName: string;
    type: 'Grade' | 'Attendance';
    details: {
        studentId: string;
        studentName: string;
        courseId: string;
        courseName: string;
        date?: string;
        assessment?: string;
        from: string;
        to: string;
    };
    reason: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    requestedAt: Date;
    reviewedBy?: string;
    reviewedAt?: Date;
}

export interface TeacherAttendanceRectificationRequest {
  id: string;
  branchId: string;
  registrarId: string;
  registrarName: string;
  teacherId: string;
  teacherName: string;
  date: string;
  fromStatus: TeacherAttendanceStatus;
  toStatus: TeacherAttendanceStatus;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
}

export interface SyllabusChangeRequest {
    id: string;
    branchId: string;
    teacherId: string;
    teacherName: string;
    classId: string;
    subjectId: string;
    requestType: 'update' | 'delete';
    lectureId: string;
    originalData?: string;
    newData?: string;
    reason: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    requestedAt: Date;
    reviewedBy?: string;
    reviewedAt?: Date;
}

export interface FeeRectificationRequest {
  id: string;
  branchId: string;
  registrarId: string;
  registrarName: string;
  templateId: string;
  requestType: 'update' | 'delete';
  originalData: string;
  newData?: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
}

export interface ExamMarkRectificationRequest {
    id: string;
    branchId: string;
    teacherId: string;
    teacherName: string;
    details: {
        studentId: string;
        studentName: string;
        examScheduleId: string;
        examinationName: string;
        subjectName: string;
        fromScore: string;
        toScore: string;
    };
    reason: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    requestedAt: Date;
    reviewedBy?: string;
    reviewedAt?: Date;
}

export interface MeetingRequest {
    id: string;
    parentId: string;
    teacherId: string;
    studentId: string;
    requestedDateTime: Date;
    agenda: string;
    status: 'pending' | 'approved' | 'denied' | 'rescheduled';
    rescheduledDateTime?: Date;
    teacherNotes?: string;
}

export interface PrincipalQuery {
  id: string;
  branchId: string;
  principalId: string;
  principalName: string;
  schoolName: string;
  subject: string;
  queryText: string;
  submittedAt: Date;
  status: 'Open' | 'Resolved';
  adminNotes?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
}

// =================================================================
// 5. GRIEVANCE & FEEDBACK TYPES
// =================================================================
export interface TeacherComplaint {
  id: string;
  branchId: string;
  studentId: string;
  studentName: string;
  teacherId?: string;
  teacherName?: string;
  subject: string;
  complaintText: string;
  submittedAt: Date;
  status: 'Open' | 'Resolved by Student';
  resolvedAt?: Date;
}

export interface ComplaintAboutStudent {
  id: string;
  studentId: string;
  studentName: string;
  branchId: string;
  raisedById: string;
  raisedByName: string;
  raisedByRole: 'Teacher' | 'Principal';
  complaintText: string;
  submittedAt: Date;
}

export interface TeacherFeedback {
    id: string;
    studentId: string;
    teacherId: string;
    parameters: Record<string, number>;
    feedbackDate: Date;
}

export interface SkillAssessment {
  id: string;
  studentId: string;
  teacherId: string;
  skills: Record<string, number>;
  assessedAt: Date;
}

// =================================================================
// 6. QUIZ & TEST TYPES
// =================================================================
export interface Quiz {
    id: string;
    teacherId: string;
    branchId: string;
    title: string;
    classId: string;
    status: 'draft' | 'published' | 'paused';
    questionsPerStudent: number;
    createdAt: Date;
}

export interface QuizQuestion {
    id: string;
    quizId: string;
    questionText: string;
    options: string[];
    correctOptionIndex: number;
}

export interface StudentQuiz {
    id: string;
    studentId: string;
    quizId: string;
    assignedQuestionIds: string[];
    status: 'pending' | 'completed';
    score?: number;
    submittedAt?: Date;
}

export interface StudentAnswer {
    id: string;
    studentQuizId: string;
    questionId: string;
    selectedOptionIndex: number;
}

export interface QuizResult {
    studentId: string;
    studentName: string;
    status: 'pending' | 'completed';
    score?: number;
    submittedAt?: Date;
}


// =================================================================
// 7. INFRASTRUCTURE & ASSETS
// =================================================================
export interface BusStop {
    id: string;
    name: string;
    pickupTime: string;
    dropTime: string;
    charges: number;
}

export interface TransportRoute {
    id: string;
    branchId: string;
    routeName: string;
    busNumber: string;
    driverName: string;
    driverNumber?: string;
    conductorName?: string;
    conductorNumber?: string;
    capacity: number;
    assignedMembers: { memberId: string; memberType: 'Student' | 'Teacher'; stopId: string }[];
    busStops: BusStop[];
}

export interface Hostel {
    id: string;
    branchId: string;
    name: string;
    warden: string;
    wardenNumber?: string;
}

export interface Room {
    id: string;
    hostelId: string;
    roomNumber: string;
    capacity: number;
    occupantIds: string[];
    fee: number;
    roomType: string;
}

export interface LibraryBook {
    id: string;
    branchId: string;
    title: string;
    author: string;
    isbn: string;
    totalCopies: number;
    availableCopies: number;
    price?: number;
    pdfUrl?: string;
}

export interface BookIssuance {
    id: string;
    bookId: string;
    memberId: string;
    memberType: 'Student' | 'Teacher';
    issuedDate: Date;
    dueDate: Date;
    returnedDate?: Date;
    finePerDay: number;
}

export interface InventoryItem {
    id: string;
    branchId: string;
    name: string;
    category: string;
    quantity: number;
    location: string;
}

export interface InventoryLog {
    id: string;
    itemId: string;
    change: number;
    reason: string;
    timestamp: Date;
    user: string;
}


// =================================================================
// 8. MISCELLANEOUS & DATA STRUCTURES
// =================================================================
export interface SchoolDocument {
    id: string;
    branchId: string;
    name: string;
    type: 'Student' | 'Staff';
    ownerId: string;
    fileUrl: string;
    uploadedAt: Date;
}
export type Document = SchoolDocument;

export interface SchoolEvent {
    id: string;
    branchId: string;
    name: string;
    date: string;
    startTime?: string;
    endTime?: string;
    description?: string;
    location?: string;
    category: 'Academic' | 'Sports' | 'Cultural' | 'Holiday' | 'Meeting' | 'Other';
    audience: ('All' | 'Staff' | 'Students' | 'Parents')[];
    audienceFilters?: {
        grades?: number[];
        classes?: string[];
    };
    sendNotification: boolean;
    createdBy: string;
    createdAt: Date;
    status: 'Pending' | 'Approved' | 'Rejected';
}

export interface Announcement {
  id: string;
  branchId: string;
  title: string;
  message: string;
  audience: 'All' | 'Staff' | 'Students' | 'Parents';
  sentAt: Date;
}

export interface SmsMessage {
    id: string;
    branchId: string;
    message: string;
    recipientCount: number;
    sentAt: Date;
    sentBy: string;
}

export interface TimetableConfig {
    id: string;
    classId: string;
    timeSlots: { startTime: string; endTime: string }[];
}

export interface TimetableSlot {
  id: string;
  classId: string;
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
  startTime: string;
  endTime: string;
  subjectId: string;
  teacherId: string;
  room?: string;
  date?: string;
}

export interface SyllabusProgress {
    id: string;
    branchId: string;
    classId: string;
    subjectId: string;
    completionPercentage: number;
}

export interface StudentSyllabusProgress {
  id: string;
  studentId: string;
  lectureId: string;
  completedAt: Date;
}

export interface SuspensionRecord {
  id: string;
  studentId: string;
  reason: 'Fee Defaulter' | 'Misbehavior' | 'Other';
  endDate: string;
  createdAt: Date;
}

export interface CourseContent {
    id: string;
    branchId: string;
    courseId: string;
    teacherId: string;
    title: string;
    description?: string;
    fileName: string;
    fileType: string;
    fileUrl: string;
    uploadedAt: Date;
}

export interface CommunicationTarget {
    branchId: 'all' | string[];
    role: UserRole | 'all';
}

export interface AdminSms {
    id: string;
    target: CommunicationTarget;
    message: string;
    sentBy: string;
    sentAt: Date;
}



export interface AdminEmail {
    id: string;
    target: CommunicationTarget;
    subject: string;
    body: string;
    sentBy: string;
    sentAt: Date;
}

export interface AdminNotification {
    id: string;
    target: CommunicationTarget;
    title: string;
    message: string;
    sentBy: string;
    sentAt: Date;
}

export interface SystemSettings {
    id: 'global';
    defaultErpPrice: number;
    globalFeatureToggles: Record<string, boolean>;
    loginPageAnnouncement: string;
}

export interface LeaveSetting {
  id: string;
  branchId: string;
  role: 'Student' | 'Teacher' | 'Registrar' | 'Librarian' | 'SupportStaff';
  settings: {
    [key in LeaveType]?: number;
  };
}

export interface ArchivedStudentRecord {
  id: string;
  studentId: string;
  academicSession: string;
  grades: Grade[];
  attendance: AttendanceRecord[];
  finalClass: string;
  archivedAt: Date;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: Date;
}

export interface SchoolClass {
  id: string;
  branchId: string;
  gradeLevel: number;
  section: string;
  studentIds: string[];
  subjectIds: string[];
  feeTemplateId?: string;
  classMentorId?: string; 
}


// =================================================================
// 9. HYDRATED & VIEW-SPECIFIC TYPES
// =================================================================

export interface StudentProfile {
    student: Student;
    grades: GradeWithCourse[];
    attendance: { present: number; absent: number; total: number; };
    attendanceHistory: AttendanceRecord[];
    classInfo: string;
    feeStatus: {
        total: number;
        paid: number;
        dueDate?: Date;
    };
    feeHistory: FeeHistoryItem[];
    rank: { class: number; school: number; };
    skills: { skill: string; value: number }[];
    recentActivity: { date: string; activity: string }[];
}

export interface TeacherProfile {
    teacher: Teacher;
    assignedClasses: { id: string; name: string; }[];
    assignedSubjects: Subject[];
    mentoredClasses: { id: string, name: string }[];
    syllabusProgress: { className: string; subjectName: string; completionPercentage: number; }[];
    classPerformance: { className: string; averageStudentScore: number; }[];
    attendance: { present: number; total: number; };
    payrollHistory: { month: string; amount: number; status: 'Paid' | 'Pending'; }[];
}

export interface ClassDetails {
    classInfo: SchoolClass;
    students: StudentWithRank[];
    subjects: ClassSubjectDetails[];
    performance: ClassPerformanceMetric[];
    attendance: ClassAttendanceMetric[];
    fees: ClassFeeDetails;
}

export interface ClassSubjectDetails {
  subjectId: string;
  subjectName: string;
  teacherName: string;
  syllabusCompletion: number;
}

export interface ClassPerformanceMetric {
    subjectName: string;
    averageScore: number;
}

export interface ClassAttendanceMetric {
    subjectName: string;
    attendanceRate: number;
}

export interface ClassFeeDetails {
    totalPending: number;
    defaulters: { studentId: string; studentName: string; pendingAmount: number; }[];
}

export interface StudentWithRank extends Student {
    classRank: number;
    schoolRank: number;
}

export interface HydratedMeetingRequest extends MeetingRequest {
    parentName: string;
    teacherName: string;
    studentName: string;
}

export interface SchoolDetails {
    branch: Branch;
    principal?: User;
    registrar?: User;
    teachers: Teacher[];
    students: Student[];
    classes: SchoolClass[];
    classFeeDetails: SchoolClassFeeDetails[];
    transportRoutes: TransportRoute[];
    classPerformance?: { name: string; performance: number }[];
    teacherPerformance?: { teacherId: string; teacherName: string; performanceIndex: number }[];
    subjectPerformanceByClass?: Record<string, { subjectName: string; averageScore: number; }[]>;
    topStudents?: { studentId: string; studentName: string; rank: number; className: string; }[];
    inventorySummary?: { totalItems: number; totalQuantity: number };
    infrastructureSummary?: {
        transportOccupancy: number;
        transportCapacity: number;
        hostelOccupancy: number;
        hostelCapacity: number;
        totalLibraryBooks: number;
    };
}

export interface SchoolClassFeeDetails {
    className: string;
    studentCount: number;
    totalFees: number;
    pendingFees: number;
    defaulters: number;
}

export interface AtRiskStudent {
    studentId: string;
    studentName: string;
    reason: string;
    value: string;
}

export interface GradebookData {
    assessments: string[];
    gradebook: {
        studentId: string;
        studentName: string;
        grades: { [assessment: string]: number | null };
    }[];
}

export interface AggregatedClass extends SchoolClass {
  students: Student[];
  stats: {
    avgAttendance: number;
    avgPerformance: number;
    syllabusCompletion: number;
  };
  teachers: { name: string; subject: string }[];
};

export interface TeacherCourse {
    id: string;
    classId: string;
    subjectId: string;
    name: string;
}

export interface LecturePlan {
    subjectName: string;
    lectures: Lecture[];
}

export interface DefaulterDetails {
    studentId: string;
    studentName: string;
    rollNo?: string;
    pendingAmount: number;
    guardianPhone: string;
}

export interface StudentWithExamMarks {
    student: Student;
    marks: {
        subjectName: string;
        score: number;
        totalMarks: number;
    }[];
}

export interface HydratedBookIssuance extends BookIssuance {
    bookTitle: string;
    memberName: string;
    memberDetails: string;
}

export interface ClassIssuanceSummary {
    classId: string;
    className: string;
    issuedCount: number;
    totalValue: number;
    studentsWithBooks: { studentName: string; bookCount: number }[];
}

export interface HydratedSchedule extends ExamSchedule {
    className: string;
    subjectName: string;
}

export interface PrincipalAttendanceOverview {
    summary: {
        studentsPresent: number;
        studentsTotal: number;
        staffPresent: number;
        staffTotal: number;
    };
    classAttendance: {
        classId: string;
        className: string;
        present: number;
        total: number;
        absentees: { id: string; name: string }[];
    }[];
    staffAttendance: {
        teacherId: string;
        teacherName: string;
        status: TeacherAttendanceStatus | 'Not Marked';
    }[];
}

export interface PrincipalFinancialsOverview {
  monthly: {
    revenue: number;
    expenditure: number;
    net: number;
    revenueBreakdown: { name: string; value: number }[];
    expenditureBreakdown: { name: string; value: number }[];
  };
  session: {
    revenue: number;
    expenditure: number;
    net: number;
  };
  summary: {
    totalPending: number;
    erpBillAmountForCycle: number;
    erpNextDueDate: string | undefined;
    erpBillingCycle: Branch['billingCycle'] | undefined;
    isErpBillPaid: boolean;
  };
  classFeeSummaries: ClassFeeSummary[];
  manualExpenses: ManualExpense[];
}

// =================================================================
// 10. DASHBOARD DATA TYPES
// =================================================================

export interface AdminDashboardData {
    summary: {
        totalSchools: number;
        totalStudents: number;
        totalTeachers: number;
        activeBranches: number;
        feesCollected: number;
        feesPending: number;
        pendingPrincipalQueries: number;
    };
    feeTrend: { month: string, collected: number, pending: number }[];
    liveFeed: { id: string, type: 'alert' | 'event' | 'exam', message: string, school: string, timestamp: Date }[];
    topPerformingSchools: { id: string; name: string; healthScore: number; }[];
    bottomPerformingSchools: { id: string; name: string; healthScore: number; }[];
    pendingRequests: {
        count: number;
        requests: RegistrationRequest[];
    };
    principalQueries: {
        count: number;
        queries: PrincipalQuery[];
    };
    performanceTrend: {
        month: string;
        averageScore: number;
    }[];
}

export interface PrincipalDashboardData {
    summary: {
        totalStudents: number;
        totalTeachers: number;
        totalClasses: number;
        feesCollected: number;
        feesPending: number;
        erpPricePerStudent?: number;
    };
    schoolRank: number;
    schoolScore: number;
    averageSchoolScore: number;
    classPerformance: { name: string; performance: number }[];
    teacherPerformance: { teacherId: string; teacherName: string; avgStudentScore: number; syllabusCompletion: number; performanceIndex: number }[];
    topStudents: { studentId: string; studentName: string; rank: number; className: string; }[];
    syllabusProgress: { name: string; progress: number }[];
    allEvents: SchoolEvent[];
    pendingApprovals: { id: string; type: string; description: string; requestedBy: string }[];
    pendingStaffRequests: {
        leave: number;
        attendance: number;
        fees: number;
    };
    collectionsByGrade: { name: string, collected: number, due: number }[];
    overdueFees: { studentId: string; studentName: string; amount: number; className: string }[];
    classes: { id: string; name: string; }[];
    subjectPerformanceByClass: Record<string, { subjectName: string; averageScore: number; }[]>;
    notifications: {
        id: string;
        type: 'QueryResponse' | 'StudentComplaint';
        message: string;
        timestamp: Date;
        link: string;
    }[];
}

export interface AcademicRequestSummary {
  id: string;
  type: 'Grade/Attendance' | 'Syllabus Change' | 'Exam Marks';
  description: string;
  requestedAt: Date;
}

export interface RegistrarDashboardData {
    summary: {
        pendingAdmissions: number;
        pendingAcademicRequests: number;
        feesPending: number;
        feesCollected: number;
        unassignedFaculty: number;
    };
    admissionRequests: Application[];
    feeOverview: { month: string, paid: number, pending: number }[];
    teacherAttendanceStatus: { teacherId: string; teacherName: string; status: 'Absent' | 'Not Marked' }[];
    classFeeSummaries: ClassFeeSummary[];
    pendingEvents: SchoolEvent[];
    academicRequests: {
        count: number;
        requests: AcademicRequestSummary[];
    };
}

export interface TeacherDashboardData {
    weeklySchedule: TimetableSlot[];
    assignmentsToReview: number;
    upcomingDeadlines: Assignment[];
    classPerformance: { className: string; average: number; }[];
    subjectMarksTrend: { assessment: string, score: number }[];
    atRiskStudents: AtRiskStudent[];
    mentoredClass?: { id: string, name: string, studentCount: number };
    rectificationRequestCount: number;
    pendingMeetingRequests: number;
    library: {
        issuedBooks: (BookIssuance & { bookTitle: string })[];
    };
}

interface FeeDetails {
    totalOutstanding: number;
    dueDate: string;
    currentMonthDue?: number;
    monthlyDues: MonthlyDue[];
    previousSessionDues?: number;
    totalAnnualFee: number;
    totalPaid: number;
    previousSessionDuesPaid?: number;
}

export interface StudentDashboardData {
    student: Student;
    branch: Branch;
    branchId: string;
    profile: {
        id: string;
        name: string;
        class: string;
        classId?: string;
        rollNo?: string;
        profilePictureUrl?: string;
        mentor: { name: string, email?: string, phone?: string };
    };
    performance: { subject: string, score: number, classAverage: number }[];
    ranks: { class: number, school: number };
    attendance: {
        monthlyPercentage: number;
        history: AttendanceRecord[];
    };
    assignments: {
        pending: Assignment[];
        graded: any[];
    };
    library: {
        issuedBooks: (BookIssuance & { bookTitle: string })[];
    };
    fees: FeeDetails;
    events: SchoolEvent[];
    announcements: Announcement[];
    aiSuggestion: string;
    timetable: TimetableSlot[];
    timetableConfig: TimetableConfig | null;
    examSchedule: (ExamSchedule & { subjectName: string })[];
    overallMarksPercentage: number;
    skills: { skill: string; value: number }[];
    monthlyFeeBreakdown?: MonthlyFee[];
    selfStudyProgress: {
        totalLectures: number;
        studentCompletedLectures: number;
        teacherCompletedLectures: number;
    };
}

export interface ChildData {
    student: Student;
    branch: Branch;
    branchId: string;
    profile: {
        id: string;
        name: string;
        class: string;
        mentor: { name: string, email?: string, phone?: string };
    };
    performance: { subject: string; score: number; classAverage: number }[];
    ranks: { class: number; school: number };
    attendance: {
        sessionPercentage: number;
        history: AttendanceRecord[];
    };
    fees: FeeDetails;
    feeHistory: FeeHistoryItem[];
    monthlyFeeBreakdown?: MonthlyFee[];
    assignments: Assignment[];
    timetable: TimetableSlot[];
    timetableConfig: TimetableConfig | null;
    examSchedule: (ExamSchedule & { subjectName: string })[];
    overallMarksPercentage: number;
    skills: { skill: string; value: number }[];
    transportDetails?: {
      route: TransportRoute;
      stop: BusStop;
    };
    accommodationDetails?: {
        hostel: Hostel;
        room: Room;
    };
    selfStudyProgress: {
        totalLectures: number;
        studentCompletedLectures: number;
        teacherCompletedLectures: number;
    };
}

export interface ParentDashboardData {
    childrenData: ChildData[];
    announcements: Announcement[];
}

export interface SystemWideFinancials {
    summary: {
        totalCollected: number;
        totalPending: number;
        collectionRate: number;
        totalExpenditure: number;
    };
    collectionBySchool: { id: string; name: string; collected: number; pending: number; status: Branch['status'] }[];
    overdueBySchool: { id: string; name: string; percentage: number; amount: number; status: Branch['status'] }[];
}

export interface ErpBillingStatus {
    branchId: string;
    branchName: string;
    totalBilled: number;
    totalPaid: number;
    pendingAmount: number;
    nextDueDate: string;
    daysOverdue: number;
    status: Branch['status'];
}

export interface SystemWideErpFinancials {
  summary: {
    totalBilled: number;
    totalPaid: number;
    pendingAmount: number;
    totalSchools: number;
    totalStudents: number;
    pendingSchoolsCount: number;
  };
  billingTrend: { month: string; billed: number; paid: number }[];
  billingStatusBySchool: ErpBillingStatus[];
}


export interface SystemWideAnalytics {
    passPercentage: { id: string; name: string; 'Pass %': number; status: Branch['status'] }[];
    teacherStudentRatio: { id: string; name: string; ratio: number; status: Branch['status'] }[];
    attendanceBySchool: { id: string; name: string; attendance: number; status: Branch['status'] }[];
}

export interface ClassFeeSummary {
    classId: string;
    className: string;
    studentCount: number;
    defaulterCount: number;
    pendingAmount: number;
}

export interface LibrarianDashboardData {
    summary: {
        totalBooks: number;
        issuedBooks: number;
        overdueBooks: number;
        uniqueMembers: number;
    };
    recentActivity: (HydratedBookIssuance & { bookTitle: string, memberName: string })[];
    overdueList: (HydratedBookIssuance & { fineAmount: number, memberDetails: string })[];
    classIssuanceSummary: ClassIssuanceSummary[];
}

export interface BranchInfrastructureStats {
    id: string;
    name: string;
    location: string;
    transportCapacity: number;
    transportOccupancy: number;
    hostelCapacity: number;
    hostelOccupancy: number;
}

export interface SystemInfrastructureData {
    summary: {
        totalTransportCapacity: number;
        totalTransportOccupancy: number;
        totalHostelCapacity: number;
        totalHostelOccupancy: number;
    };
    branches: BranchInfrastructureStats[];
}

export interface SchoolFinancialDetails {
    branchId: string;
    branchName: string;
    summary: {
        totalRevenue: number;
        totalExpenditure: number;
        netProfit: number;
    };
    revenueBreakdown: {
        tuitionFees: number;
        transportFees: number;
        hostelFees: number;
        tuitionByGrade: { grade: string; collected: number; pending: number }[];
    };
    expenditureBreakdown: {
        totalPayroll: number;
        manualExpenses: number;
        erpBill: number;
    };
}

