import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

const Page = ({ title }) => (
  <main className="container py-5">
    <h1>{title}</h1>
    <p className="text-secondary">Module scaffold ready for implementation.</p>
  </main>
);

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Page title="Dashboard" />} />
        <Route path="/login" element={<Page title="Login" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
