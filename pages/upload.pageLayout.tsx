import AppLayout from "../components/AppLayout";
import { UserRoute } from "../components/ProtectedRoute";
import { ProfileRequiredRoute } from "../components/ProfileRequiredRoute";

export default [UserRoute, ProfileRequiredRoute, AppLayout];