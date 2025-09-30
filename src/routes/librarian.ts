import { Router } from 'express';
import * as librarianController from '../controllers/librarianController';
import { protect } from '../middlewares/auth';
import { restrictTo } from '../middlewares/roles';

const router = Router();

router.use(protect);
router.use(restrictTo('Librarian'));

// Dashboard
router.get('/dashboard', librarianController.getLibrarianDashboardData);

// Book Management
router.get('/books', librarianController.getLibraryBooks);
router.post('/books', librarianController.createBook); // Assumes file upload is handled
router.patch('/books/:id', librarianController.updateBook); // Assumes file upload is handled
router.delete('/books/:id', librarianController.deleteBook);
router.get('/books/search', librarianController.searchLibraryBooks);

// Issuance Management
router.get('/issuances', librarianController.getBookIssuancesWithMemberDetails);
router.post('/issue-book', librarianController.issueBookByIsbnOrId);
router.patch('/issuances/:id/return', librarianController.returnBook);

// General
router.get('/attendance', librarianController.getLibrarianAttendance);

export default router;
