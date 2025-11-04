import { Request, Response, NextFunction} from "express";
import { librarianApiService } from "../services";
import prisma from "../prisma";
import { LibraryBook } from "@prisma/client";
import { put } from "@vercel/blob";

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

export const getLibraryBooks = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const books = await librarianApiService.getLibraryBooks(req.user.branchId);
    res.status(200).json(books);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
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
    const pdfFile = req.file; 
    let fileUrl: string | undefined = undefined;

    // --- 2. Handle File Upload ---
    if (pdfFile) {
      // This creates a unique filename, e.g., "books/my-book-title.pdf"
      const blob = await put(
        `books/${bookData.title.replace(/\s+/g, "-")}-${Date.now()}.pdf`,
        pdfFile.buffer,
        {
          access: "public",
          contentType: pdfFile.mimetype,
        }
      );
      fileUrl = blob.url; // Get the public URL of the uploaded file
    }
    // --- End of File Upload ---

    const totalCopies = parseInt(bookData.totalCopies, 10) || 1;
    const price = parseFloat(bookData.price) || 0;

    // 3. Create the book in the database, now with the pdfUrl
    const newBook = await prisma.libraryBook.create({
      data: {
        branchId: req.user.branchId,
        title: bookData.title,
        author: bookData.author,
        isbn: bookData.isbn,
        price: price,
        totalCopies: totalCopies,
        availableCopies: totalCopies,
        pdfUrl: fileUrl, // <-- 4. Save the new URL
      },
    });

    res.status(201).json(newBook);
  } catch (error: any) {
    next(error);
  }
};

// You can apply the same logic to your 'updateBook' function
export const updateBook = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: bookId } = req.params;
    const bookData = req.body;
    const pdfFile = req.file;
    let fileUrl: string | undefined = undefined;

    // --- Handle File Upload ---
    if (pdfFile) {
      // In a real app, you would also delete the OLD file from Vercel Blob
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
    // --- End of File Upload ---

    const totalCopies = parseInt(bookData.totalCopies, 10);
    const price = parseFloat(bookData.price);

    const existingBook = await prisma.libraryBook.findUnique({
      where: { id: bookId },
      select: { totalCopies: true, availableCopies: true },
    });

    if (!existingBook) {
      return res.status(404).json({ message: "Book not found" });
    }

    let availableCopies = existingBook.availableCopies;
    if (totalCopies && totalCopies !== existingBook.totalCopies) {
      const diff = totalCopies - existingBook.totalCopies;
      availableCopies = existingBook.availableCopies + diff;
      if (availableCopies < 0) {
        availableCopies = 0;
      }
    }

    // Create an update object
    const updateData: any = {
      title: bookData.title,
      author: bookData.author,
      isbn: bookData.isbn,
      price: price,
      totalCopies: totalCopies,
      availableCopies: availableCopies,
    };

    // Only add pdfUrl to the update if a new file was uploaded
    if (fileUrl) {
      updateData.pdfUrl = fileUrl;
    }

    const updatedBook = await prisma.libraryBook.update({
      where: { id: bookId },
      data: updateData,
    });

    res.status(200).json(updatedBook);
  } catch (error: any) {
    next(error);
  }
};


export const deleteBook = async (req: Request, res: Response) => {
  try {
    await librarianApiService.deleteBook(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const searchLibraryBooks = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const books = await librarianApiService.searchLibraryBooks(
      req.user.branchId,
      req.query.q as string
    );
    res.status(200).json(books);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getBookIssuancesWithMemberDetails = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const issuances =
      await librarianApiService.getBookIssuancesWithMemberDetails(
        req.user.branchId
      );
    res.status(200).json(issuances);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const issueBookByIsbnOrId = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const { bookIdentifier, memberId, dueDate, finePerDay } = req.body;
    const result = await librarianApiService.issueBookByIsbnOrId(
      req.user.branchId,
      bookIdentifier,
      memberId,
      dueDate,
      finePerDay
    );
    res
      .status(200)
      .json({
        message: `Issued "${result.bookTitle}" to ${result.memberName}.`,
      });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const returnBook = async (req: Request, res: Response) => {
  try {
    await librarianApiService.returnBook(req.params.id);
    res.status(200).json({ message: "Book returned successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getLibrarianAttendance = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const attendance = await librarianApiService.getLibrarianAttendanceById(
      req.user.id
    );
    res.status(200).json(attendance);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
