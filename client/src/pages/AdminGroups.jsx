import AdminResourceList from "../components/AdminResourceList.jsx";
const filters = [["status", "Status", ["active", "archived"]]];
export default function AdminGroups() { return <AdminResourceList resource="groups" title="Classrooms" filters={filters} />; }
