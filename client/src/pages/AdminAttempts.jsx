import AdminResourceList from "../components/AdminResourceList.jsx";
const filters = [["status", "Status", ["in-progress", "submitted"]], ["kind", "Delivery", ["standalone", "assignment"]]];
export default function AdminAttempts() { return <AdminResourceList resource="attempts" title="Attempts" filters={filters} />; }
