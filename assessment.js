const express = require("express");
const app = express();

app.use(express.json());

// In-memory database
let dishes = [];
let nextId = 1;

const CATEGORIES = [
  "Starter",
  "MainCourse",
  "Dessert",
  "Beverage",
  "Snack",
  "Side",
  "Mocktail",
  "Biryani",
];

const KNOWN_FIELDS = [
  "dishName",
  "restaurant",
  "category",
  "price",
  "calories",
  "isVegetarian",
];

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

// Validation logic
function validateField(key, value) {
  if (key === "dishName" || key === "restaurant") {
    if (typeof value !== "string") return `${key} must be a string`;
    const trimmed = value.trim();
    if (trimmed.length < 2 || trimmed.length > 50) {
      return `${key} must be between 2 and 50 characters`;
    }
    return { ok: true, val: trimmed };
  }

  if (key === "category") {
    if (typeof value !== "string" || !CATEGORIES.includes(value)) {
      return `category must be one of: ${CATEGORIES.join(", ")}`;
    }
    return { ok: true, val: value };
  }

  if (key === "price") {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 5000) {
      return "price must be a number > 0 and <= 5000";
    }
    return { ok: true, val: Math.round(value * 100) / 100 };
  }

  if (key === "calories") {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 3000) {
      return "calories must be an integer between 0 and 3000";
    }
    return { ok: true, val: value };
  }

  if (key === "isVegetarian") {
    if (typeof value !== "boolean") {
      return "isVegetarian must be a boolean (true or false)";
    }
    return { ok: true, val: value };
  }

  return { ok: false };
}

// 1. CREATE (POST /api/dishes)
app.post("/api/dishes", (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendError(res, 400, "Body must be a JSON object");
  }

  const cleanData = {};
  for (const field of KNOWN_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) {
      return sendError(res, 400, `Missing required field: ${field}`);
    }
    const check = validateField(field, body[field]);
    if (typeof check === "string") {
      return sendError(res, 400, check);
    }
    cleanData[field] = check.val;
  }

  // Uniqueness check: (dishName + restaurant)
  const exists = dishes.some(
    (d) =>
      d.dishName.toLowerCase() === cleanData.dishName.toLowerCase() &&
      d.restaurant.toLowerCase() === cleanData.restaurant.toLowerCase()
  );
  if (exists) {
    return sendError(res, 400, "A dish with this name and restaurant already exists");
  }

  const newDish = { id: nextId++, ...cleanData };
  dishes.push(newDish);
  return res.status(201).json(newDish);
});

// 2. LIST (GET /api/dishes)
app.get("/api/dishes", (req, res) => {
  const query = req.query;

  let page = query.page !== undefined ? query.page : "1";
  let limit = query.limit !== undefined ? query.limit : "10";

  if (!/^[1-9]\d*$/.test(String(page))) {
    return sendError(res, 400, "page must be a positive integer");
  }
  if (!/^[1-9]\d*$/.test(String(limit))) {
    return sendError(res, 400, "limit must be a positive integer");
  }

  page = Number(page);
  limit = Number(limit);

  if (limit > 50) {
    return sendError(res, 400, "limit cannot exceed 50");
  }

  if (query.category !== undefined && !CATEGORIES.includes(query.category)) {
    return sendError(res, 400, "Invalid category filter");
  }

  if (query.isVegetarian !== undefined && !["true", "false"].includes(query.isVegetarian)) {
    return sendError(res, 400, "isVegetarian must be true or false");
  }

  for (const key of ["minPrice", "maxPrice"]) {
    if (query[key] !== undefined) {
      const num = Number(query[key]);
      if (query[key].trim?.() === "" || !Number.isFinite(num) || num < 0) {
        return sendError(res, 400, `${key} must be a non-negative number`);
      }
    }
  }

  if (
    query.minPrice !== undefined &&
    query.maxPrice !== undefined &&
    Number(query.minPrice) > Number(query.maxPrice)
  ) {
    return sendError(res, 400, "minPrice cannot be greater than maxPrice");
  }

  if (query.sort !== undefined && !["dishName", "price", "calories"].includes(query.sort)) {
    return sendError(res, 400, "sort must be dishName, price, or calories");
  }

  const order = query.order ?? "asc";
  if (!["asc", "desc"].includes(order)) {
    return sendError(res, 400, "order must be asc or desc");
  }

  // Filtering
  let result = [...dishes];

  if (query.category !== undefined) {
    result = result.filter((d) => d.category === query.category);
  }

  if (query.isVegetarian !== undefined) {
    const isVeg = query.isVegetarian === "true";
    result = result.filter((d) => d.isVegetarian === isVeg);
  }

  if (query.minPrice !== undefined) {
    result = result.filter((d) => d.price >= Number(query.minPrice));
  }

  if (query.maxPrice !== undefined) {
    result = result.filter((d) => d.price <= Number(query.maxPrice));
  }

  if (query.search && query.search.trim() !== "") {
    const term = query.search.trim().toLowerCase();
    result = result.filter(
      (d) =>
        d.dishName.toLowerCase().includes(term) ||
        d.restaurant.toLowerCase().includes(term)
    );
  }

  // Sorting (Default is insertion order if no sort is specified)
  if (query.sort) {
    const dir = order === "asc" ? 1 : -1;
    result.sort((a, b) => {
      const vA = typeof a[query.sort] === "string" ? a[query.sort].toLowerCase() : a[query.sort];
      const vB = typeof b[query.sort] === "string
