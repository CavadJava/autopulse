import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function Home() {
  return <h1>AutoPulse Auksion</h1>;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </Router>
  );
}
