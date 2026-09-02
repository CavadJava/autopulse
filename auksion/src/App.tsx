import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Header from './components/Header';
import Home from './pages/Home';
import ListingDetail from './pages/ListingDetail';
import Login from './pages/Login';
import LoginVerify from './pages/LoginVerify';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/elan/:id" element={<ListingDetail />} />
          <Route path="/giris" element={<Login />} />
          <Route path="/giris/kod" element={<LoginVerify />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
