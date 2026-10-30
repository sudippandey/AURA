// Single place for every backend route. Change paths here when your API differs.
export const ENDPOINTS = {
  health: "/health",
  products: "/products",
  productById: (id) => `/products/${id}`,
  featured: "/products/featured",
  related: (id) => `/products/${id}/related`,
  search: "/products/search",
  byCategory: (cat) => `/categories/${cat}/products`,
  categories: "/categories",
  reviews: (id) => `/products/${id}/reviews`,
  cart: "/cart",
  login: "/auth/login",
  register: "/auth/register",
  forgot: "/auth/forgot-password",
  profile: "/auth/me",
  orders: "/orders",
  orderById: (id) => `/orders/${id}`,
};
