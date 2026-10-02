import AdminResourceList from "../components/AdminResourceList.jsx";
const filters = [["status", "Status", ["draft", "published"]], ["moderationState", "Moderation", ["active", "restricted"]], ["visibility", "Visibility", ["public", "private", "unlisted"]]];
export default function AdminQuizzes() { return <AdminResourceList resource="quizzes" title="Quizzes" filters={filters} />; }
