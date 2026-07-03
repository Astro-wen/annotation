import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "@/pages/Home";
import ImportSample from "@/pages/ImportSample";
import Settings from "@/pages/Settings";
import TaskDetail from "@/pages/TaskDetail";
import Annotation from "@/pages/Annotation";
import Audit from "@/pages/Audit";
import ResultCompare from "@/pages/ResultCompare";
import CReview from "@/pages/CReview";

export default function App() {
  // Match Vite's base so routing works under the GitHub Pages sub-path
  // (e.g. /annotation). React Router wants the basename without a trailing "/".
  const basename = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <Router basename={basename}>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<Home />} />
        <Route path="/import" element={<ImportSample />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/task/:taskId" element={<TaskDetail />} />
        <Route path="/annotate/:sessionId" element={<Annotation />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/audit/compare/:sessionId" element={<ResultCompare />} />
        <Route path="/audit/review/:sessionId" element={<CReview />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Router>
  );
}
