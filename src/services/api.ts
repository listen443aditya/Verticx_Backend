// api.ts
import axios from "axios";

// Remove custom ImportMeta and ImportMetaEnv interfaces, as Vite provides types automatically.

// 🔹 Axios instance
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:5000/api",
  withCredentials: true,
});


// ========================
// Auth APIs
// ========================
export const login = (role: string, credentials: { email: string; password: string }) =>
  api.post(`/auth/login/${role}`, credentials);

export const logout = () => api.post("/auth/logout");

// ========================
// Principal APIs
// ========================
export const getPrincipalDashboard = () => api.get("/principal/dashboard");

export const getPrincipalStaff = () => api.get("/principal/staff");

export const suspendStaff = (id: string) => api.put(`/principal/staff/${id}/suspend`);

export const reinstateStaff = (id: string) => api.put(`/principal/staff/${id}/reinstate`);

export const getFinanceOverview = () => api.get("/principal/finance/overview");

export const getAttendanceOverview = () => api.get("/principal/attendance/overview");

export const createRazorpayOrder = (amount: number) =>
  api.post("/principal/payments/erp-order", { amount });

export const verifyRazorpayPayment = (data: any) =>
  api.post("/principal/payments/erp-verify", data);

// ========================
// Admin APIs
// ========================
export const getAdminDashboard = () => api.get("/admin/dashboard");

export const getAllUsers = () => api.get("/admin/users");

export const createUser = (payload: any) => api.post("/admin/users", payload);

export const updateUser = (id: string, payload: any) => api.put(`/admin/users/${id}`, payload);

export const deleteUser = (id: string) => api.delete(`/admin/users/${id}`);

// ========================
// Teacher APIs
// ========================
export const getTeacherDashboard = () => api.get("/teacher/dashboard");

export const getAssignedClasses = () => api.get("/teacher/classes");

export const markAttendance = (classId: string, payload: any) =>
  api.post(`/teacher/classes/${classId}/attendance`, payload);

// ========================
// Student APIs
// ========================
export const getStudentDashboard = () => api.get("/student/dashboard");

export const getStudentAttendance = () => api.get("/student/attendance");

export const getStudentAssignments = () => api.get("/student/assignments");

export const submitAssignment = (id: string, payload: FormData) =>
  api.post(`/student/assignments/${id}/submit`, payload, {
    headers: { "Content-Type": "multipart/form-data" },
  });

// ========================
// Utility
// ========================
export default api;
