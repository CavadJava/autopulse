import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Listings from './pages/Listings';
import ListingRouter from './pages/ListingRouter';
import Pricing from './pages/Pricing';
import CheckoutPage from './pages/CheckoutPage';
import BusinessDashboard from './pages/BusinessDashboard';
import Login from './pages/Login';
import LoginVerify from './pages/LoginVerify';
import NewListing from './pages/NewListing';
import Compare from './pages/Compare';
import ShopList from './pages/shop/ShopList';
import ShopFront from './pages/shop/ShopFront';
import ShopLogin from './pages/shop/ShopLogin';
import ShopRegister from './pages/shop/ShopRegister';
import MyShop from './pages/shop/MyShop';
import MyShopMesajlar from './pages/shop/MyShopMesajlar';
import KabinetLayout from './pages/kabinet/KabinetLayout';
import KabinetOverview from './pages/kabinet/KabinetOverview';
import KabinetElanlarim from './pages/kabinet/KabinetElanlarim';
import KabinetMesajlarim from './pages/kabinet/KabinetMesajlarim';
import KabinetBildirisler from './pages/kabinet/KabinetBildirisler';
import KabinetProfil from './pages/kabinet/KabinetProfil';
import KabinetKartlarim from './pages/kabinet/KabinetKartlarim';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import Header from './components/Header';
import CompareBar from './components/CompareBar';
import { AuthProvider } from './context/AuthContext';
import { CompareProvider } from './context/CompareContext';
import { ThemeProvider } from './context/ThemeContext';

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <CompareProvider>
        <Router>
          <Header />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/elanlar" element={<Listings />} />
            <Route path="/elan/:id" element={<ListingRouter />} />
            <Route path="/qiymetler" element={<Pricing />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/business" element={<BusinessDashboard />} />
            <Route path="/giris" element={<Login />} />
            <Route path="/giris/kod" element={<LoginVerify />} />
            <Route path="/elan-ver" element={<NewListing />} />
            <Route path="/elan-ver/:id" element={<NewListing />} />
            <Route path="/muqayise" element={<Compare />} />
            <Route path="/magazalar" element={<ShopList />} />
            <Route path="/magazalar/:name" element={<ShopFront />} />
            <Route path="/magaza-giris" element={<ShopLogin />} />
            <Route path="/magaza-qeydiyyat" element={<ShopRegister />} />
            <Route path="/magazam" element={<MyShop />} />
            <Route path="/magazam/mesajlar" element={<MyShopMesajlar />} />
            <Route path="/kabinet" element={<KabinetLayout />}>
              <Route index element={<KabinetOverview />} />
              <Route path="elanlarim" element={<KabinetElanlarim />} />
              <Route path="mesajlarim" element={<KabinetMesajlarim />} />
              <Route path="bildirisler" element={<KabinetBildirisler />} />
              <Route path="profil" element={<KabinetProfil />} />
              <Route path="kartlarim" element={<KabinetKartlarim />} />
            </Route>
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
          </Routes>
          <CompareBar />
        </Router>
      </CompareProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}
