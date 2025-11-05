// services/librarianApiService.ts
import { db, saveDb } from "./database";
import type {
  LibrarianDashboardData,
  LibraryBook,
  BookIssuance,
  HydratedBookIssuance,
  Student,
  Teacher,
  ClassIssuanceSummary,
  TeacherAttendanceRecord,
} from "../types/api";
import { BaseApiService } from "./baseApiService";

export class LibrarianApiService extends BaseApiService {
  async getLibrarianDashboardData(
    branchId: string
  ): Promise<LibrarianDashboardData> {
    await this.delay(400);
    const books = (db.libraryBooks as LibraryBook[]).filter(
      (b) => b.branchId === branchId
    );
    const issuances = (db.bookIssuances as BookIssuance[]).filter(
      (i) => this.getLibraryBookById(i.bookId)?.branchId === branchId
    );
    const today = new Date();
    const overdue = issuances.filter(
      (i) => !i.returnedDate && new Date(i.dueDate) < today
    );
    const uniqueMembers = new Set(issuances.map((i) => i.memberId)).size;

    const recentActivity: HydratedBookIssuance[] = issuances
      .sort(
        (a, b) =>
          new Date(b.returnedDate || b.issuedDate).getTime() -
          new Date(a.returnedDate || a.issuedDate).getTime()
      )
      .slice(0, 10)
      .map((i) => ({
        ...i,
        bookTitle: this.getBookTitle(i.bookId),
        memberName: this.getMemberName(i.memberId, i.memberType),
        memberDetails: "",
      }));

    const overdueList: any[] = overdue.map((i) => {
      const diffDays = Math.ceil(
        (today.getTime() - new Date(i.dueDate).getTime()) / (1000 * 3600 * 24)
      );
      return {
        ...i,
        bookTitle: this.getBookTitle(i.bookId),
        memberName: this.getMemberName(i.memberId, i.memberType),
        memberDetails: i.memberType,
        fineAmount: diffDays * i.finePerDay,
      };
    });

    const classIssuanceSummary: ClassIssuanceSummary[] = [];
    const classes = await this.getSchoolClassesByBranch(branchId);
    for (const c of classes) {
      const studentIds = new Set(c.studentIds);
      const classIssuances = issuances.filter(
        (i) => i.memberType === "Student" && studentIds.has(i.memberId)
      );
      if (classIssuances.length > 0) {
        const studentBookCounts: { [key: string]: number } = {};
        classIssuances.forEach((i) => {
          const studentName =
            this.getStudentById(i.memberId)?.name || "Unknown";
          studentBookCounts[studentName] =
            (studentBookCounts[studentName] || 0) + 1;
        });

        classIssuanceSummary.push({
          classId: c.id,
          className: `Grade ${c.gradeLevel} - ${c.section}`,
          issuedCount: classIssuances.length,
          totalValue: classIssuances.reduce(
            (sum, i) => sum + (this.getLibraryBookById(i.bookId)?.price || 0),
            0
          ),
          studentsWithBooks: Object.entries(studentBookCounts).map(
            ([studentName, bookCount]) => ({ studentName, bookCount })
          ),
        });
      }
    }

    return {
      summary: {
        totalBooks: books.reduce((sum, b) => sum + b.totalCopies, 0),
        issuedBooks: issuances.filter((i) => !i.returnedDate).length,
        overdueBooks: overdue.length,
        uniqueMembers,
      },
      recentActivity,
      overdueList,
      classIssuanceSummary,
    };
  }

  async getLibraryBooks(branchId: string): Promise<LibraryBook[]> {
    await this.delay(200);
    return (db.libraryBooks as LibraryBook[]).filter(
      (b) => b.branchId === branchId
    );
  }

  async getBookIssuances(branchId: string): Promise<BookIssuance[]> {
    await this.delay(200);
    const bookIdsInBranch = new Set(
      (await this.getLibraryBooks(branchId)).map((b) => b.id)
    );
    return (db.bookIssuances as BookIssuance[]).filter((i) =>
      bookIdsInBranch.has(i.bookId)
    );
  }

  async getBookIssuancesWithMemberDetails(
    branchId: string
  ): Promise<HydratedBookIssuance[]> {
    const bookIdsInBranch = new Set(
      (db.libraryBooks as LibraryBook[])
        .filter((b) => b.branchId === branchId)
        .map((b) => b.id)
    );
    return (db.bookIssuances as BookIssuance[])
      .filter((i) => bookIdsInBranch.has(i.bookId))
      .map((i) => ({
        ...i,
        bookTitle: this.getBookTitle(i.bookId),
        memberName: this.getMemberName(i.memberId, i.memberType),
        memberDetails: i.memberType,
      }));
  }

  // Corrected: Removed browser-specific 'File' type from signature
  async updateBook(
    bookId: string,
    bookData: Partial<LibraryBook>
  ): Promise<void> {
    const book = this.getLibraryBookById(bookId);
    if (book) {
      Object.assign(book, bookData);
      // In a real backend, file path updates would happen here, likely from middleware
      saveDb();
    }
  }

  // Corrected: Removed browser-specific 'File' type from signature
  async createBook(
    branchId: string,
    bookData: Partial<LibraryBook>
  ): Promise<void> {
    const newBook: LibraryBook = {
      id: this.generateId("book"),
      branchId,
      ...bookData,
      availableCopies: bookData.totalCopies || 1,
      pdfUrl: undefined, // This would be set after a file is uploaded and saved
    } as LibraryBook;
    (db.libraryBooks as LibraryBook[]).push(newBook);
    saveDb();
  }

  async deleteBook(bookId: string): Promise<void> {
    const isIssued = (db.bookIssuances as BookIssuance[]).some(
      (i) => i.bookId === bookId && !i.returnedDate
    );
    if (isIssued)
      throw new Error("Cannot delete book. Some copies are still issued.");
    db.libraryBooks = (db.libraryBooks as LibraryBook[]).filter(
      (b) => b.id !== bookId
    );
    saveDb();
  }

  async issueBook(
    bookId: string,
    memberId: string,
    memberType: "Student" | "Teacher",
    dueDate: Date,
    finePerDay: number
  ): Promise<void> {
    const book = this.getLibraryBookById(bookId);
    if (!book || book.availableCopies < 1)
      throw new Error("Book not available");
    book.availableCopies--;
    const issuance: BookIssuance = {
      id: this.generateId("iss"),
      bookId,
      memberId,
      memberType,
      issuedDate: new Date(),
      dueDate,
      finePerDay,
      returnedDate: null,
    };
    (db.bookIssuances as BookIssuance[]).push(issuance);
    saveDb();
  }

  async issueBookByIsbnOrId(
    branchId: string,
    bookIdentifier: string,
    memberId: string,
    dueDate: string,
    finePerDay: number
  ): Promise<{ bookTitle: string; memberName: string }> {
    const book = (db.libraryBooks as LibraryBook[]).find(
      (b) =>
        (b.id === bookIdentifier || b.isbn === bookIdentifier) &&
        b.branchId === branchId
    );
    if (!book) throw new Error("Book not found.");
    if (book.availableCopies < 1)
      throw new Error("No copies available to issue.");
    const member = (db.students as (Student | Teacher)[])
      .concat(db.teachers)
      .find((m) => m.id === memberId);
    if (!member) throw new Error("Member not found.");
    const memberType = (member as Student).gradeLevel ? "Student" : "Teacher";
    book.availableCopies--;
    const issuance: BookIssuance = {
      id: this.generateId("iss"),
      bookId: book.id,
      memberId,
      memberType,
      issuedDate: new Date(),
      dueDate: new Date(dueDate),
      finePerDay,
      returnedDate: null,
    };
    (db.bookIssuances as BookIssuance[]).push(issuance);
    saveDb();
    return { bookTitle: book.title, memberName: member.name };
  }

  async returnBook(issuanceId: string): Promise<void> {
    const issuance = (db.bookIssuances as BookIssuance[]).find(
      (i) => i.id === issuanceId
    );
    if (issuance && !issuance.returnedDate) {
      issuance.returnedDate = new Date();
      const book = this.getLibraryBookById(issuance.bookId);
      if (book) {
        book.availableCopies++;
      }
      saveDb();
    }
  }

  async searchLibraryBooks(
    branchId: string,
    query: string
  ): Promise<LibraryBook[]> {
    const lowerQuery = query.toLowerCase();
    return (db.libraryBooks as LibraryBook[]).filter(
      (b) =>
        b.branchId === branchId &&
        (b.title.toLowerCase().includes(lowerQuery) ||
          b.author.toLowerCase().includes(lowerQuery) ||
          b.isbn.includes(query))
    );
  }

  async getLibrarianAttendanceById(
    librarianId: string
  ): Promise<TeacherAttendanceRecord[]> {
    return (db.teacherAttendance as TeacherAttendanceRecord[]).filter(
      (r) => r.teacherId === librarianId
    );
  }
}
