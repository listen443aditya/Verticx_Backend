/**
 * @file verticx-backend/src/services/baseApiService.ts
 * @description Provides a base class with shared utilities for all API services.
 */

import { db, saveDb } from "./database";
import type * as Api from "../types/api";

export const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
export const generatePassword = () => Math.random().toString(36).slice(-8);

export const generateUniqueId = (
  type:
    | "student"
    | "teacher"
    | "registrar"
    | "librarian"
    | "supportstaff"
    | "principal"
) => {
  let prefix: string;
  let count: number;
  const allUsers = db.users as Api.User[];
  switch (type) {
    case "student":
      prefix = "STU";
      count = db.students.length;
      return `VRTX-${prefix}-${(count + 1).toString().padStart(4, "0")}`;
    case "teacher":
      prefix = "TCH";
      count = db.teachers.length;
      return `VRTX-${prefix}-${(count + 1).toString().padStart(3, "0")}`;
    case "registrar":
      prefix = "REG";
      count = allUsers.filter((u) => u.role === "Registrar").length;
      return `VRTX-${prefix}-${(count + 1).toString().padStart(3, "0")}`;
    case "librarian":
      prefix = "LIB";
      count = allUsers.filter((u) => u.role === "Librarian").length;
      return `VRTX-${prefix}-${(count + 1).toString().padStart(3, "0")}`;
    case "supportstaff":
      prefix = "SST";
      count = allUsers.filter((u) => u.role === "SupportStaff").length;
      return `VRTX-${prefix}-${(count + 1).toString().padStart(3, "0")}`;
    default:
      return `${type}-${Math.random().toString(36).substr(2, 9)}`;
  }
};

export abstract class BaseApiService {
  protected delay = delay;
  protected generateId = (prefix: string) =>
    `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
  protected generatePassword = generatePassword;

  // --- Core Data Accessors (Protected) ---
  protected getUserById = (id: string): Api.User | undefined =>
    (db.users as Api.User[]).find((u) => u.id === id);
  protected getStudentById = (id: string): Api.Student | undefined =>
    (db.students as Api.Student[]).find((s) => s.id === id);
  protected getTeacherById = (id: string): Api.Teacher | undefined =>
    (db.teachers as Api.Teacher[]).find((t) => t.id === id);
  protected getClassById = (id: string): Api.SchoolClass | undefined =>
    (db.schoolClasses as Api.SchoolClass[]).find((c) => c.id === id);
  protected getSubjectById = (id: string): Api.Subject | undefined =>
    (db.subjects as Api.Subject[]).find((s) => s.id === id);
  protected getCourseById = (id: string): Api.Course | undefined =>
    (db.courses as Api.Course[]).find((c) => c.id === id);
  protected getCourseNameById = (id: string): string =>
    this.getCourseById(id)?.name || "Unknown Course";
  protected getExaminationById = (id: string): Api.Examination | undefined =>
    (db.examinations as Api.Examination[]).find((e) => e.id === id);
  protected getLibraryBookById = (
    bookId: string
  ): Api.LibraryBook | undefined =>
    (db.libraryBooks as Api.LibraryBook[]).find((b) => b.id === bookId);
  protected getBookTitle = (bookId: string): string =>
    this.getLibraryBookById(bookId)?.title || "Unknown";
  protected getMemberName = (
    memberId: string,
    memberType: "Student" | "Teacher"
  ): string => {
    const member =
      memberType === "Student"
        ? this.getStudentById(memberId)
        : this.getTeacherById(memberId);
    return member?.name || "Unknown Member";
  };

  // --- Common Async Fetchers (Now Public) ---
  // CORRECTED: These methods are now public so service classes can expose them to controllers.
  public async getBranchById(branchId: string): Promise<Api.Branch | null> {
    await this.delay(100);
    return (db.branches as Api.Branch[]).find((b) => b.id === branchId) || null;
  }
  public async getStudentsByBranch(branchId: string): Promise<Api.Student[]> {
    await this.delay(150);
    return (db.students as Api.Student[]).filter(
      (s) => s.branchId === branchId
    );
  }
  public async getStudentsForClass(classId: string): Promise<Api.Student[]> {
    const sClass = this.getClassById(classId);
    if (!sClass) return [];
    return (db.students as Api.Student[]).filter((s) =>
      sClass.studentIds.includes(s.id)
    );
  }
  public async getSchoolClassesByBranch(
    branchId: string
  ): Promise<Api.SchoolClass[]> {
    return (db.schoolClasses as Api.SchoolClass[]).filter(
      (c) => c.branchId === branchId
    );
  }
  public async getSubjectsByBranch(branchId: string): Promise<Api.Subject[]> {
    return (db.subjects as Api.Subject[]).filter(
      (s) => s.branchId === branchId
    );
  }
  public async getTeachersByBranch(branchId: string): Promise<Api.Teacher[]> {
    return (db.teachers as Api.Teacher[]).filter(
      (t) => t.branchId === branchId
    );
  }
  public async getStudentProfileDetails(
    studentId: string
  ): Promise<Api.StudentProfile | null> {
    // This logic remains complex and specific, better left in specific services that need it.
    // This is a placeholder to show it would be public if it were truly generic.
    throw new Error(
      "getStudentProfileDetails should be implemented in a specific service."
    );
  }
}
