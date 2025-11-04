import { Request, Response, NextFunction} from "express";
import { librarianApiService } from "../services";
import prisma from "../prisma";
import { LibraryBook } from "@prisma/client";
import { put } from "@vercel/blob";


const getLibrarianBranchId = (req: Request): string | null => {
  if (req.user?.role === "Librarian" && req.user.branchId) {
    return req.user.branchId;
  }
  return null;
};

export const getLibrarianDashboardData = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const data = await librarianApiService.getLibrarianDashboardData(
      req.user.branchId
    );
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
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
        // You need to fetch member details. This requires relations.
        // This part of your schema is complex and needs more info.
        // We'll return placeholder names for now.
      },
      orderBy: { issuedDate: "desc" },
    });

    // Mock data for member names until relations are fixed
    const hydratedIssuances = issuances.map((iss) => ({
      ...iss,
      bookTitle: iss.book.title,
      memberName: "Demo Member",
      memberDetails: "Demo Role",
    }));

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

    // 2. Find the member (Student or Teacher)
    const [student, teacher] = await Promise.all([
      prisma.student.findFirst({ where: { id: memberId, branchId: branchId } }),
      prisma.teacher.findFirst({ where: { id: memberId, branchId: branchId } }),
    ]);
    const member = student || teacher;
    const memberType = student ? "Student" : teacher ? "Teacher" : null;

    if (!member || !memberType) {
      return res
        .status(404)
        .json({ message: "Member not found in this branch." });
    }

    // 3. Create the issuance and decrement book count
    await prisma.$transaction([
      prisma.bookIssuance.create({
        data: {
          bookId: book.id,
          memberId: member.id,
          memberType: memberType,
          branchId: branchId,
          issuedDate: new Date(),
          dueDate: new Date(dueDate),
          finePerDay: parseFloat(finePerDay),
        },
      }),
      prisma.libraryBook.update({
        where: { id: book.id },
        data: { availableCopies: { decrement: 1 } },
      }),
    ]);

    res.status(200).json({
      message: `Issued "${book.title}" to ${member.name}.`,
      bookTitle: book.title,
      memberName: member.name,
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