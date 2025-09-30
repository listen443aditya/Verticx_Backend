// services/index.ts
import { sharedApiService } from "./sharedApiService";
import { AdminApiService } from "./adminApiService";
import { PrincipalApiService } from "./principalApiService";
import { RegistrarApiService } from "./registrarApiService";
import { TeacherApiService } from "./teacherApiService";
import { StudentApiService } from "./studentApiService";
import { ParentApiService } from "./parentApiService";
import { LibrarianApiService } from "./librarianApiService";

export { sharedApiService };
export const adminApiService = new AdminApiService();
export const principalApiService = new PrincipalApiService();
export const registrarApiService = new RegistrarApiService();
export const teacherApiService = new TeacherApiService();
export const studentApiService = new StudentApiService();
export const parentApiService = new ParentApiService();
export const librarianApiService = new LibrarianApiService();
