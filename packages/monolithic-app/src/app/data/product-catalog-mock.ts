import { Product } from "../models/product.model";

export const products: Product[] = [
  {
    id: 1,
    name: 'Angular Developer Tee',
    description: 'Perfect for Angular developers who love type-safety!',
    price: 29.99,
    color: 'Red',
    size: 'M',
    imageUrl: 'https://placehold.co/300x400',
    rating: 4.5
  },
  {
    id: 2,
    name: 'TypeScript Enthusiast Shirt',
    description: 'Show your love for interfaces and decorators!',
    price: 24.99,
    color: 'Blue',
    size: 'L',
    imageUrl: 'https://placehold.co/300x400',
    rating: 4.8
  },
  // Add more products as needed
]