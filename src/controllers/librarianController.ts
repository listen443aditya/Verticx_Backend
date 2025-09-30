import { Request, Response } from "express";
import { librarianApiService } from "../services";

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

export const createBook = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    // NOTE: In a real implementation, middleware like 'multer' would handle req.file
    await librarianApiService.createBook(req.user.branchId, req.body);
    res.status(201).json({ message: "Book created successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateBook = async (req: Request, res: Response) => {
  try {
    await librarianApiService.updateBook(req.params.id, req.body);
    res.status(200).json({ message: "Book updated successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
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
