const express = require("express");

const app = express();
app.use(express.json());

// In-memory storage. Menu items reset when the server restarts.
let menuItems = [];
let nextId = 1;

const categories = ["Appetizers", "Mains", "Sides", "Desserts", "Beverages"];
const fields = [
  "name",
  "description",
  "category",
  "price",
  "isVegetarian",
  "isAvailable",
];

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function validateMenuItem(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Body must be a JSON object";
  }

  const keys = Object.keys(body);
  const unknownFields = keys.filter((key) => !fields.includes(key));

  if (unknownFields.length > 0) {
    return `Unknown field: ${unknownFields[0]}`;
  }

  if (partial && keys.length === 0) {
    return "At least one field is required";
  }

  const requiredFields = partial ? keys : fields;

  for (const field of requiredFields) {
    if (!Object.hasOwn(body, field)) {
      return `${field} is required`;
    }
  }

  const data = {};

  for (const key of keys) {
    const value = body[key];

    if (key === "name" || key === "description") {
      if (typeof value !== "string") {
        return `${key} must be a string`;
      }

      data[key] = value.trim();

      if (key === "name" && (data[key].length < 2 || data[key].length > 80)) {
        return "name must be between 2 and 80 characters";
      }

      if (key === "description" && data[key].length > 500) {
        return "description cannot exceed 500 characters";
      }
    } else if (key === "category") {
      if (typeof value !== "string" || !categories.includes(value)) {
        return `category must be one of: ${categories.join(", ")}`;
      }

      data[key] = value;
    } else if (key === "price") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 100000
      ) {
        return "price must be greater than 0 and at most 100000";
      }

      data[key] = Math.round(value * 100) / 100;
    } else if (key === "isVegetarian" || key === "isAvailable") {
      if (typeof value !== "boolean") {
        return `${key} must be a boolean`;
      }

      data[key] = value;
    }
  }

  return data;
}

function findMenuItem(id) {
  return menuItems.find((item) => String(item.id) === id);
}

// Create a menu item.
app.post("/api/menu", (req, res) => {
  const data = validateMenuItem(req.body);

  if (typeof data === "string") {
    return sendError(res, 400, data);
  }

  const menuItem = { id: nextId++, ...data };
  menuItems.push(menuItem);

  return res.status(201).json(menuItem);
});

// List, search, filter, sort, and paginate menu items.
app.get("/api/menu", (req, res) => {
  const query = req.query;
  let { page = "1", limit = "10" } = query;

  if (!/^[1-9]\d*$/.test(page) || !/^[1-9]\d*$/.test(limit)) {
    return sendError(res, 400, "page and limit must be positive integers");
  }

  page = Number(page);
  limit = Number(limit);

  if (limit > 100) {
    return sendError(res, 400, "limit cannot exceed 100");
  }

  if (query.category !== undefined && !categories.includes(query.category)) {
    return sendError(
      res,
      400,
      `category must be one of: ${categories.join(", ")}`
    );
  }

  for (const key of ["isVegetarian", "isAvailable"]) {
    if (
      query[key] !== undefined &&
      !["true", "false"].includes(query[key])
    ) {
      return sendError(res, 400, `${key} must be true or false`);
    }
  }

  for (const key of ["minPrice", "maxPrice"]) {
    if (
      query[key] !== undefined &&
      (query[key].trim() === "" ||
        !Number.isFinite(Number(query[key])) ||
        Number(query[key]) < 0)
    ) {
      return sendError(res, 400, `${key} must be a non-negative number`);
    }
  }

  if (
    query.sort !== undefined &&
    !["name", "price", "category"].includes(query.sort)
  ) {
    return sendError(res, 400, "sort must be name, price, or category");
  }

  const order = query.order ?? "asc";

  if (!["asc", "desc"].includes(order)) {
    return sendError(res, 400, "order must be asc or desc");
  }

  let result = [...menuItems];

  if (query.category !== undefined) {
    result = result.filter((item) => item.category === query.category);
  }

  for (const key of ["isVegetarian", "isAvailable"]) {
    if (query[key] !== undefined) {
      const value = query[key] === "true";
      result = result.filter((item) => item[key] === value);
    }
  }

  if (query.minPrice !== undefined) {
    result = result.filter((item) => item.price >= Number(query.minPrice));
  }

  if (query.maxPrice !== undefined) {
    result = result.filter((item) => item.price <= Number(query.maxPrice));
  }

  if (query.search) {
    const term = query.search.trim().toLowerCase();

    result = result.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term)
    );
  }

  if (query.sort) {
    const direction = order === "asc" ? 1 : -1;

    result.sort((a, b) => {
      const left =
        typeof a[query.sort] === "string"
          ? a[query.sort].toLowerCase()
          : a[query.sort];

      const right =
        typeof b[query.sort] === "string"
          ? b[query.sort].toLowerCase()
          : b[query.sort];

      if (left < right) return -direction;
      if (left > right) return direction;
      return 0;
    });
  }

  const total = result.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;

  return res.json({
    data: result.slice(start, start + limit),
    page,
    limit,
    total,
    totalPages,
  });
});

// Get one menu item.
app.get("/api/menu/:id", (req, res) => {
  const menuItem = findMenuItem(req.params.id);

  if (!menuItem) {
    return sendError(res, 404, "Menu item not found");
  }

  return res.json(menuItem);
});

// Replace a menu item.
app.put("/api/menu/:id", (req, res) => {
  const index = menuItems.findIndex(
    (item) => String(item.id) === req.params.id
  );

  if (index === -1) {
    return sendError(res, 404, "Menu item not found");
  }

  const data = validateMenuItem(req.body);

  if (typeof data === "string") {
    return sendError(res, 400, data);
  }

  menuItems[index] = { id: menuItems[index].id, ...data };

  return res.json(menuItems[index]);
});

// Update selected fields on a menu item.
app.patch("/api/menu/:id", (req, res) => {
  const index = menuItems.findIndex(
    (item) => String(item.id) === req.params.id
  );

  if (index === -1) {
    return sendError(res, 404, "Menu item not found");
  }

  const data = validateMenuItem(req.body, true);

  if (typeof data === "string") {
    return sendError(res, 400, data);
  }

  menuItems[index] = {
    ...menuItems[index],
    ...data,
    id: menuItems[index].id,
  };

  return res.json(menuItems[index]);
});

// Delete a menu item.
app.delete("/api/menu/:id", (req, res) => {
  const index = menuItems.findIndex(
    (item) => String(item.id) === req.params.id
  );

  if (index === -1) {
    return sendError(res, 404, "Menu item not found");
  }

  menuItems.splice(index, 1);
  return res.status(204).end();
});

// Handle malformed JSON and other server errors.
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return sendError(res, 400, "Malformed JSON");
  }

  return sendError(res, 500, "Internal server error");
});

// Handle unknown routes.
app.use((req, res) => {
  return sendError(res, 404, "Route not found");
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Restaurant menu API listening on port ${PORT}`);
});
