import AppLayout from "../components/AppLayout";
import { AllAuthenticatedRoute } from "../components/ProtectedRoute";

// Allow all authenticated users (individual and admin) to view report artifacts
export default [AllAuthenticatedRoute, AppLayout];