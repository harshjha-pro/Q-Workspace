import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import About, { ContentStatus } from './pages/About';
import Analyse from './pages/Analyse';
import CategoryPage from './pages/Category';
import Compare from './pages/Compare';
import Explore from './pages/Explore';
import Guide from './pages/Guide';
import Home from './pages/Home';
import IngredientDetail from './pages/IngredientDetail';
import Ingredients from './pages/Ingredients';
import Learn, { ArticlePage } from './pages/Learn';
import NotFound from './pages/NotFound';
import ProductDetail from './pages/ProductDetail';
import Profile, { ComparisonsPage, MyProductsPage, PersonalisePage, RoutinesPage, SavedPage } from './pages/Profile';
import SearchPage from './pages/Search';
import TopicDetail from './pages/TopicDetail';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/category/:id" element={<CategoryPage />} />
        <Route path="/ingredients" element={<Ingredients />} />
        <Route path="/ingredient/:id" element={<IngredientDetail />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/topic/:id" element={<TopicDetail />} />
        <Route path="/guide/:kind/:id" element={<Guide />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/analyse" element={<Analyse />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="/learn/:id" element={<ArticlePage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/personalise" element={<PersonalisePage />} />
        <Route path="/profile/saved" element={<SavedPage />} />
        <Route path="/profile/comparisons" element={<ComparisonsPage />} />
        <Route path="/profile/products" element={<MyProductsPage />} />
        <Route path="/profile/routines" element={<RoutinesPage />} />
        <Route path="/about" element={<About />} />
        <Route path="/content" element={<ContentStatus />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
