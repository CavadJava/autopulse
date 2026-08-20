import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Listings from './pages/Listings';
import ListingDetail from './pages/ListingDetail';
import Pricing from './pages/Pricing';
import CheckoutPage from './pages/CheckoutPage';
import BusinessDashboard from './pages/BusinessDashboard';
import Header from './components/Header';

export default function App() {
  return (
    <Router>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/elanlar" element={<Listings />} />
        <Route path="/elan/:id" element={<ListingDetail />} />
        <Route path="/qiymetler" element={<Pricing />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/business" element={<BusinessDashboard />} />
      </Routes>
    </Router>
  );
}
