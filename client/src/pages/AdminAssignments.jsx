import AdminResourceList from "../components/AdminResourceList.jsx";
const filters = [["state", "Availability", ["draft", "upcoming", "open", "overdue", "closed"]]];
export default function AdminAssignments() { return <AdminResourceList resource="assignments" title="Assignments" filters={filters} />; }
