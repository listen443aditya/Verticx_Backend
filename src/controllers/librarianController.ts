import { Request, Response, NextFunction} from "express";
import { librarianApiService } from "../services";
import prisma from "../prisma";
import { LibraryBook } from "@prisma/client";
import { put } from "@vercel/blob";
import type { LibrarianDashboardData } from "../types/api";

const getLibrarianBranchId = (req: Request): string | null => {
  if (req.user?.role === "Librarian" && req.user.branchId) {
    return req.user.branchId;
  }
  return null;
};

export const getLibrarianDashboardData = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branchId = getLibrarianBranchId(req);
    if (!branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }

    const today = new Date();

    const results = await prisma.$transaction([
      // Query 1: Get book stats
      prisma.libraryBook.aggregate({
        where: { branchId },
        _count: { id: true },
        _sum: { totalCopies: true },
      }),
      // Query 2: Get issued count
      prisma.bookIssuance.aggregate({
        where: { branchId, returnedDate: null },
        _count: { id: true },
      }),
      // Query 3: Get overdue count
      prisma.bookIssuance.aggregate({
        where: { branchId, returnedDate: null, dueDate: { lt: today } },
        _count: { id: true },
      }),
      // Query 4: Get unique member count
      prisma.bookIssuance.groupBy({
        by: ["memberId"],
        where: { branchId },
        _count: { memberId: true },
        orderBy: { memberId: "asc" },
      }),
      // Query 5: Get recent activity
      prisma.bookIssuance.findMany({
        where: { branchId },
        orderBy: [{ issuedDate: "desc" }],
        take: 10,
        include: {
          book: { select: { title: true } },
          studentMember: {
            select: {
              name: true,
              class: { select: { gradeLevel: true, section: true } },
            },
          },
          teacherMember: { select: { name: true } },
        },
      }),
      // Query 6: Get all currently overdue books
      prisma.bookIssuance.findMany({
        where: { branchId, returnedDate: null, dueDate: { lt: today } },
        orderBy: { dueDate: "asc" },
        include: {
          book: { select: { title: true } },
          studentMember: {
            select: {
              name: true,
              class: { select: { gradeLevel: true, section: true } },
            },
          },
          teacherMember: { select: { name: true } },
        },
      }),
      // Query 7: Get data for class summary
      prisma.bookIssuance.findMany({
        where: {
          branchId,
          returnedDate: null,
          memberType: "Student",
          studentMember: { isNot: null },
        },
        include: {
          studentMember: {
            select: {
              name: true,
              class: {
                select: { id: true, gradeLevel: true, section: true },
              },
            },
          },
          book: { select: { price: true } },
        },
      }),
    ]);

    // FIX: Destructure with explicit casting to avoid TS errors
    const bookStats = results[0];
    const issuedCount = results[1];
    const overdueCount = results[2];
    const uniqueMemberCount = results[3];
    const recentActivityRaw = results[4] as any[]; // <--- FIX
    const overdueListRaw = results[5] as any[]; // <--- FIX
    const classIssuancesRaw = results[6] as any[]; // <--- FIX

    // --- 2. Format the data for the frontend ---

    const summary = {
      totalBooks: bookStats._count.id,
      totalCopies: bookStats._sum.totalCopies || 0,
      issuedBooks: issuedCount._count.id,
      overdueBooks: overdueCount._count.id,
      uniqueMembers: uniqueMemberCount.length,
    };

    const recentActivity = recentActivityRaw.map((item) => {
      const member = item.studentMember || item.teacherMember;
      const memberDetails = item.studentMember
        ? `Grade ${item.studentMember.class?.gradeLevel}-${item.studentMember.class?.section}`
        : item.teacherMember
        ? "Teacher"
        : "Unknown";

      return {
        ...item,
        memberName: member?.name || "Unknown",
        bookTitle: item.book.title,
        memberDetails: memberDetails,
        memberType: item.memberType as "Student" | "Teacher",
      };
    });

    const overdueList = overdueListRaw.map((item) => {
      const member = item.studentMember || item.teacherMember;
      const memberDetails = item.studentMember
        ? `Grade ${item.studentMember.class?.gradeLevel}-${item.studentMember.class?.section}`
        : "Teacher";

      const daysOverdue = Math.max(
        0,
        Math.floor(
          (today.getTime() - new Date(item.dueDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );
      const fineAmount = daysOverdue * (item.finePerDay || 0);

      return {
        ...item,
        bookTitle: item.book.title,
        memberName: member?.name || "Unknown",
        memberDetails: memberDetails,
        fineAmount: fineAmount,
        memberType: item.memberType as "Student" | "Teacher",
      };
    });

    // Process class issuance summary
    const classSummaryMap = new Map<
      string,
      {
        className: string;
        classId: string;
        issuedCount: number;
        totalValue: number;
        studentsWithBooks: Map<string, number>;
      }
    >();

    for (const item of classIssuancesRaw) {
      if (!item.studentMember?.class) continue;

      const classInfo = item.studentMember.class;
      const studentName = item.studentMember.name;
      const classId = classInfo.id;

      if (!classSummaryMap.has(classId)) {
        classSummaryMap.set(classId, {
          classId: classId,
          className: `Grade ${classInfo.gradeLevel}-${classInfo.section}`,
          issuedCount: 0,
          totalValue: 0,
          studentsWithBooks: new Map<string, number>(),
        });
      }

      const summary = classSummaryMap.get(classId)!;
      summary.issuedCount++;
      summary.totalValue += item.book?.price || 0;

      const studentBookCount = summary.studentsWithBooks.get(studentName) || 0;
      summary.studentsWithBooks.set(studentName, studentBookCount + 1);
    }

    const classIssuanceSummary = Array.from(classSummaryMap.values()).map(
      (summary) => ({
        ...summary,
        studentsWithBooks: Array.from(summary.studentsWithBooks.entries()).map(
          ([name, count]) => ({
            studentName: name,
            bookCount: count,
          })
        ),
      })
    );

    const dashboardData: LibrarianDashboardData = {
      summary,
      recentActivity,
      overdueList,
      classIssuanceSummary,
    };

    res.status(200).json(dashboardData);
  } catch (error: any) {
    next(error);
  }
};

export const getLibraryBooks = async (
  req: Request,
  res: Response,
  next: NextFunction 
) => {
  try {
    const branchId = getLibrarianBranchId(req);
    if (!branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const books = await prisma.libraryBook.findMany({
      where: { branchId: branchId },
      orderBy: { title: "asc" },
    });

    res.status(200).json(books);
  } catch (error: any) {
    next(error);
  }
};

export const createBook = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }

    const bookData = req.body;

    // FIX: Cast req.file to tell TypeScript it exists
const pdfFile = (req as any).file;
    let fileUrl: string | undefined = undefined;

    if (pdfFile) {
      const blob = await put(
        `books/${bookData.title.replace(/\s+/g, "-")}-${Date.now()}.pdf`,
        pdfFile.buffer,
        {
          access: "public",
          contentType: pdfFile.mimetype,
        }
      );
      fileUrl = blob.url;
    }

    const totalCopies = parseInt(bookData.totalCopies, 10) || 1;
    const price = parseFloat(bookData.price) || 0;

    const newBook = await prisma.libraryBook.create({
      data: {
        branchId: req.user.branchId,
        title: bookData.title,
        author: bookData.author,
        isbn: bookData.isbn,
        price: price,
        totalCopies: totalCopies,
        availableCopies: totalCopies,
        pdfUrl: fileUrl,
      },
    });

    res.status(201).json(newBook);
  } catch (error: any) {
    next(error); // Pass error to global handler
  }
};

export const updateBook = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: bookId } = req.params;
    const bookData = req.body;

    // FIX: Cast req.file to tell TypeScript it exists
const pdfFile = (req as any).file;
    let fileUrl: string | undefined = undefined;

    if (pdfFile) {
      const blob = await put(
        `books/${bookData.title.replace(/\s+/g, "-")}-${Date.now()}.pdf`,
        pdfFile.buffer,
        {
          access: "public",
          contentType: pdfFile.mimetype,
        }
      );
      fileUrl = blob.url;
    }

    const totalCopies = parseInt(bookData.totalCopies, 10);
    const price = parseFloat(bookData.price);

    const existingBook = await prisma.libraryBook.findUnique({
      where: { id: bookId },
      select: { totalCopies: true, availableCopies: true },
    });

    if (!existingBook) {
      return res.status(44).json({ message: "Book not found" });
    }

    let availableCopies = existingBook.availableCopies;
    if (totalCopies && totalCopies !== existingBook.totalCopies) {
      const diff = totalCopies - existingBook.totalCopies;
      availableCopies = existingBook.availableCopies + diff;
      if (availableCopies < 0) {
        availableCopies = 0;
      }
    }

    const updateData: any = {
      title: bookData.title,
      author: bookData.author,
      isbn: bookData.isbn,
      price: price,
      totalCopies: totalCopies,
      availableCopies: availableCopies,
    };

    if (fileUrl) {
      updateData.pdfUrl = fileUrl;
    }

    const updatedBook = await prisma.libraryBook.update({
      where: { id: bookId },
      data: updateData,
    });

    res.status(200).json(updatedBook);
  } catch (error: any) {
    next(error); // Pass error to global handler
  }
};


export const deleteBook = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1. Get the librarian's branch ID for security
    const branchId = getLibrarianBranchId(req);
    if (!branchId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const { id: bookId } = req.params;

    // 2. Security Check: Find the book AND verify it's in their branch.
    const book = await prisma.libraryBook.findFirst({
      where: {
        id: bookId,
        branchId: branchId,
      },
      select: { id: true }, // We only need to know if it exists
    });

    if (!book) {
      return res
        .status(404)
        .json({ message: "Book not found in your branch." });
    }

    // 3. Integrity check: fail if book is currently issued
    const activeIssuances = await prisma.bookIssuance.count({
      where: { bookId: bookId, returnedDate: null },
    });

    if (activeIssuances > 0) {
      return res.status(400).json({
        message: `Cannot delete: ${activeIssuances} copies are still issued.`,
      });
    }

    // 4. Attempt to delete the book
    await prisma.libraryBook.delete({
      where: { id: bookId },
    });

    res.status(204).send();
  } catch (error: any) {
    // 5. Handle database-level integrity errors
    if (error.code === "P2003") {
      // Foreign key constraint failed
      return res.status(400).json({
        message:
          "Cannot delete book: It has a history of past issuances. Please set its quantity to 0 to archive it instead.",
      });
    }
    // Pass all other errors to the global error handler
    next(error);
  }
};
export const searchLibraryBooks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branchId = getLibrarianBranchId(req);
    if (!branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }

    const query = req.query.q as string;

    const books = await prisma.libraryBook.findMany({
      where: {
        branchId: branchId,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { author: { contains: query, mode: "insensitive" } },
          { isbn: { contains: query, mode: "insensitive" } },
        ],
      },
    });
    res.status(200).json(books);
  } catch (error: any) {
    next(error);
  }
};

export const getBookIssuancesWithMemberDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branchId = getLibrarianBranchId(req);
    if (!branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }

    const issuances = await prisma.bookIssuance.findMany({
      where: { branchId: branchId },
      include: {
        book: { select: { title: true } },
        // --- THIS IS THE FIX ---
        // We must include the related member profiles to get their names
        studentMember: {
          select: {
            name: true,
            class: { select: { gradeLevel: true, section: true } },
          },
        },
        teacherMember: { select: { name: true } },
        // --- END OF FIX ---
      },
      orderBy: { issuedDate: "desc" },
    });

    // Map the data to the flat structure your frontend expects
    const hydratedIssuances = issuances.map((iss) => {
      const member = iss.studentMember || iss.teacherMember;
      const memberDetails = iss.studentMember
        ? `Grade ${iss.studentMember.class?.gradeLevel}-${iss.studentMember.class?.section}`
        : "Teacher";

      return {
        ...iss,
        bookTitle: iss.book.title,
        memberName: member?.name || "Unknown Member",
        memberDetails: memberDetails,
      };
    });

    res.status(200).json(hydratedIssuances);
  } catch (error: any) {
    next(error);
  }
};

export const issueBookByIsbnOrId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branchId = getLibrarianBranchId(req);
    if (!branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }

    const { bookIdentifier, memberId, dueDate, finePerDay } = req.body;

    // 0. Basic Validation
    if (!bookIdentifier || !memberId || !dueDate) {
      return res.status(400).json({
        message: "Book Identifier, Member ID, and Due Date are required.",
      });
    }

    // 1. Find the book
    const book = await prisma.libraryBook.findFirst({
      where: {
        branchId: branchId,
        OR: [{ id: bookIdentifier }, { isbn: bookIdentifier }],
      },
    });

    if (!book) {
      return res.status(404).json({ message: "Book not found." });
    }
    if (book.availableCopies <= 0) {
      return res
        .status(400)
        .json({ message: "All copies are currently issued." });
    }

    // 2. Find the MEMBER (USER)
    const memberUser = await prisma.user.findFirst({
      where: {
        branchId: branchId,
        OR: [{ id: memberId }, { userId: memberId }],
      },
      include: {
        studentProfile: { select: { id: true } },
        teacher: { select: { id: true } },
      },
    });

    if (!memberUser) {
      return res
        .status(404)
        .json({ message: "Member not found in this branch." });
    }

    // 3. Get the correct profile ID (Student or Teacher)
    let memberProfileId: string | undefined;
    let memberRole: "Student" | "Teacher" | null = null;


    // The runtime data IS there because of the 'include' above, but TS is being strict.
    if (memberUser.role === "Student" && (memberUser as any).studentProfile) {
      memberProfileId = (memberUser as any).studentProfile.id;
      memberRole = "Student";
    } else if (memberUser.role === "Teacher" && (memberUser as any).teacher) {
      memberProfileId = (memberUser as any).teacher.id;
      memberRole = "Teacher";
    }

    if (!memberProfileId || !memberRole) {
      return res.status(404).json({
        message:
          "Member exists as a user, but has no valid Student or Teacher profile.",
      });
    }

    // 4. Create the issuance and decrement book count
    await prisma.$transaction([
      prisma.bookIssuance.create({
        data: {
          bookId: book.id,
          branchId: branchId,

          // Core Fields
          memberId: memberProfileId,
          memberType: memberRole,
          issuedDate: new Date(),
          dueDate: new Date(dueDate),

          finePerDay: finePerDay ? parseFloat(String(finePerDay)) : 0,

          // Relations
          studentId: memberRole === "Student" ? memberProfileId : null,
          teacherId: memberRole === "Teacher" ? memberProfileId : null,
        },
      }),
      prisma.libraryBook.update({
        where: { id: book.id },
        data: { availableCopies: { decrement: 1 } },
      }),
    ]);

    res.status(200).json({
      message: `Issued "${book.title}" to ${memberUser.name}.`,
      bookTitle: book.title,
      memberName: memberUser.name,
    });
  } catch (error: any) {
    next(error);
  }
};

export const returnBook = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: issuanceId } = req.params;

    const issuance = await prisma.bookIssuance.findUnique({
      where: { id: issuanceId },
    });

    if (!issuance) {
      return res.status(404).json({ message: "Issuance record not found." });
    }
    if (issuance.returnedDate) {
      return res
        .status(400)
        .json({ message: "Book has already been returned." });
    }

    await prisma.$transaction([
      prisma.bookIssuance.update({
        where: { id: issuanceId },
        data: { returnedDate: new Date() },
      }),
      prisma.libraryBook.update({
        where: { id: issuance.bookId },
        data: { availableCopies: { increment: 1 } },
      }),
    ]);

    res.status(200).json({ message: "Book returned successfully." });
  } catch (error: any) {
    next(error);
  }
};

export const getLibrarianAttendance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    // A librarian's attendance is in the StaffAttendanceRecord
    const attendance = await prisma.staffAttendanceRecord.findMany({
      where: { userId: req.user.id },
      orderBy: { date: "desc" },
    });
    res.status(200).json(attendance);
  } catch (error: any) {
    next(error);
  }
};

export const getMyLeaveApplications = async (
  req: Request,
  res: Response,
  next: NextFunction 
) => {
  const applicantId = req.user?.id; 

  if (!applicantId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const applications = await prisma.leaveApplication.findMany({
      where: { applicantId: applicantId },
      orderBy: { fromDate: "desc" },
    });
    res.status(200).json(applications);
  } catch (error) {
    next(error); 
  }
};