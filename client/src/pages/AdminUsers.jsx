import AdminResourceList from "../components/AdminResourceList.jsx";
const filters = [["role", "Role", ["student", "teacher", "admin"]], ["status", "Account status", ["active", "suspended"]]];
export default function AdminUsers() { return <AdminResourceList resource="users" title="Users" filters={filters} />; }
