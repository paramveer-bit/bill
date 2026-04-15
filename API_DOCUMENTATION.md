# API Documentation

## Overview

This is a comprehensive API for a billing and inventory management system built with Express.js and Prisma ORM. The API handles categories, products, customers, suppliers, purchases, and sales management.

**Base URL:** `/api/v1`

**Content-Type:** `application/json`

---

## Error Response Format

All error responses follow this format:

```json
{
  "statusCode": 400,
  "message": "Error message",
  "data": null,
  "success": false
}
```

---

## Success Response Format

All success responses follow this format:

```json
{
  "statusCode": 200,
  "message": "Success message",
  "data": {},
  "success": true
}
```

---

# CATEGORIES API

## Base Path: `/api/v1/categories`

### 1. Create Category
**Endpoint:** `POST /api/v1/categories`

**Description:** Create a new category with optional parent category (hierarchical structure with max 2 levels)

**Request Body:**
```json
{
  "name": "string (required)",
  "description": "string (required)",
  "parentId": "string | null (optional)"
}
```

**Response (201):**
```json
{
  "statusCode": 201,
  "message": "Category created successfully",
  "data": {
    "id": "string",
    "name": "string",
    "description": "string",
    "parentId": "string | null",
    "parent": null,
    "children": []
  },
  "success": true
}
```

**Validation Rules:**
- `name`: Required, minimum 1 character
- `parentId`: Optional, but if provided, must reference an existing category
- Max nesting level: 2 (a subcategory cannot have a subcategory as parent)

**Error Responses:**
- `400`: Validation error or cannot create category under a subcategory
- `404`: Parent category not found

---

### 2. Get All Categories
**Endpoint:** `GET /api/v1/categories`

**Description:** Retrieve all categories with optional flat/hierarchical structure

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `flat` | boolean | If `true`, returns flat list. Default returns hierarchical (parent-children) |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Categories retrieved successfully",
  "data": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "parentId": null,
      "children": [
        {
          "id": "string",
          "name": "string",
          "description": "string",
          "parentId": "string"
        }
      ]
    }
  ],
  "success": true
}
```

**Example Requests:**
- Get hierarchical: `GET /api/v1/categories`
- Get flat list: `GET /api/v1/categories?flat=true`

---

### 3. Get Category by ID
**Endpoint:** `GET /api/v1/categories/:id`

**Description:** Retrieve a specific category with parent, children, and products

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Category ID |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Category retrieved successfully",
  "data": {
    "id": "string",
    "name": "string",
    "description": "string",
    "parentId": "string | null",
    "parent": null,
    "children": [],
    "products": [
      {
        "id": "string",
        "name": "string",
        "sku": "string",
        "currentSellPrice": "number"
      }
    ]
  },
  "success": true
}
```

**Error Responses:**
- `400`: Category ID is required
- `404`: Category not found

---

### 4. Update Category
**Endpoint:** `PUT /api/v1/categories/:id`

**Description:** Update category details and/or parent

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Category ID |

**Request Body:**
```json
{
  "name": "string (optional)",
  "description": "string (optional)",
  "parentId": "string | null (optional)"
}
```

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Category updated successfully",
  "data": {
    "id": "string",
    "name": "string",
    "description": "string",
    "parentId": "string | null"
  },
  "success": true
}
```

**Error Responses:**
- `400`: Invalid category ID or validation error
- `404`: Category not found or parent category not found

---

### 5. Delete Category
**Endpoint:** `DELETE /api/v1/categories/:id`

**Description:** Delete a category and all its subcategories. Products are unlinked (categoryId set to null)

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Category ID |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Category deleted successfully",
  "data": null,
  "success": true
}
```

**Error Responses:**
- `400`: Invalid category ID
- `404`: Category not found

**Note:** This operation runs as a transaction:
1. Nullifies `categoryId` on all affected products
2. Deletes all subcategories
3. Deletes the parent category

---

# PRODUCTS API

## Base Path: `/api/v1/products`

### 1. Create Product
**Endpoint:** `POST /api/v1/products`

**Description:** Create a new product with unit conversions (e.g., Pcs → Case)

**Request Body:**
```json
{
  "sku": "string (optional)",
  "name": "string (required)",
  "baseUnit": "string (required, e.g., 'Pcs')",
  "currentSellPrice": "number (required, positive)",
  "taxRate": "number (required, 0-100)",
  "isStockItem": "boolean (optional, default: false)",
  "categoryId": "string | null (optional)",
  "unitConversions": [
    {
      "unitName": "string (required)",
      "conversionQty": "number (required, positive integer)"
    }
  ]
}
```

**Response (201):**
```json
{
  "statusCode": 201,
  "message": "Product created successfully",
  "data": {
    "id": "string",
    "sku": "string",
    "name": "string",
    "baseUnit": "string",
    "currentSellPrice": "number",
    "taxRate": "number",
    "isStockItem": "boolean",
    "categoryId": "string | null",
    "category": {},
    "unitConversions": [
      {
        "id": "number",
        "unitName": "string",
        "conversionQty": "number"
      }
    ]
  },
  "success": true
}
```

**Validation Rules:**
- `name`: Required, minimum 1 character
- `baseUnit`: Required, minimum 1 character (e.g., "Pcs")
- `currentSellPrice`: Required, positive number
- `taxRate`: Required, 0-100%
- `unitConversions`: At least the base unit (with qty 1) is auto-included
- `categoryId`: Optional, if provided must reference existing category

**Error Responses:**
- `400`: Validation error
- `404`: Category not found

**Example Request:**
```json
{
  "name": "Milk Carton 1L",
  "baseUnit": "Pcs",
  "currentSellPrice": 150,
  "taxRate": 5,
  "categoryId": "cat-123",
  "unitConversions": [
    { "unitName": "Case", "conversionQty": 24 }
  ]
}
```

---

### 2. Get All Products
**Endpoint:** `GET /api/v1/products`

**Description:** Retrieve products with optional filtering and search

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search by product name or SKU (case-insensitive) |
| `categoryId` | string | Filter by category ID |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Products retrieved successfully",
  "data": [
    {
      "id": "string",
      "sku": "string",
      "name": "string",
      "baseUnit": "string",
      "currentSellPrice": "number",
      "taxRate": "number",
      "isStockItem": "boolean",
      "categoryId": "string | null",
      "category": {},
      "unitConversions": []
    }
  ],
  "success": true
}
```

**Example Requests:**
- Get all: `GET /api/v1/products`
- Search: `GET /api/v1/products?search=milk`
- Filter by category: `GET /api/v1/products?categoryId=cat-123`
- Combined: `GET /api/v1/products?search=milk&categoryId=cat-123`

---

### 3. Get Product by ID
**Endpoint:** `GET /api/v1/products/:id`

**Description:** Retrieve detailed product info including current stock

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Product ID |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Product retrieved successfully",
  "data": {
    "id": "string",
    "sku": "string",
    "name": "string",
    "baseUnit": "string",
    "currentSellPrice": "number",
    "taxRate": "number",
    "isStockItem": "boolean",
    "categoryId": "string | null",
    "unitConversions": [],
    "purchaseBatches": [],
    "totalStockPcs": "number"
  },
  "success": true
}
```

**Error Responses:**
- `400`: Product ID is required
- `404`: Product not found

---

### 4. Get Products by Category
**Endpoint:** `GET /api/v1/products/category/:categoryId`

**Description:** Get all products in a category and its subcategories

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `categoryId` | string | Category ID |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Products retrieved successfully",
  "data": [
    {
      "id": "string",
      "name": "string",
      "sku": "string",
      "baseUnit": "string",
      "currentSellPrice": "number"
    }
  ],
  "success": true
}
```

**Error Responses:**
- `400`: Category ID is required

---

### 5. Update Product
**Endpoint:** `PUT /api/v1/products/:id`

**Description:** Update product details and unit conversions

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Product ID |

**Request Body:** (Same schema as Create)
```json
{
  "sku": "string (optional)",
  "name": "string (optional)",
  "baseUnit": "string (optional)",
  "currentSellPrice": "number (optional)",
  "taxRate": "number (optional)",
  "isStockItem": "boolean (optional)",
  "categoryId": "string | null (optional)",
  "unitConversions": [] (optional)
}
```

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Product updated successfully",
  "data": {}
}
```

**Error Responses:**
- `400`: Product ID is required or validation error
- `404`: Product not found

---

### 6. Get Product Stock Info
**Endpoint:** `GET /api/v1/products/:id/stock-info`

**Description:** Get current stock info (FIFO front batch)

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Product ID |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "OK",
  "data": {
    "stockBase": "number"
  },
  "success": true
}
```

**Error Responses:**
- `400`: Product ID is required

---

# CUSTOMERS API

## Base Path: `/api/v1/customer`

### 1. Create Customer
**Endpoint:** `POST /api/v1/customer`

**Description:** Create a new customer

**Request Body:**
```json
{
  "name": "string (required)",
  "email": "string (required, valid email)",
  "phone": "string (required, min 10 digits)",
  "gstNumber": "string (required)",
  "address": "string (required)",
  "town": "string (required, min 5 characters)"
}
```

**Response (201):**
```json
{
  "statusCode": 201,
  "message": "Customer created successfully",
  "data": {
    "id": "string",
    "name": "string",
    "email": "string",
    "phone": "string",
    "gstNumber": "string",
    "address": "string",
    "town": "string",
    "balance": "number"
  },
  "success": true
}
```

**Validation Rules:**
- `name`: Required, minimum 1 character
- `email`: Required, must be valid email format
- `phone`: Required, minimum 10 digits
- `gstNumber`: Required
- `address`: Required
- `town`: Required, minimum 5 characters

**Error Responses:**
- `400`: Validation error

---

### 2. Get All Customers
**Endpoint:** `GET /api/v1/customer`

**Description:** Retrieve all customers

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Customers retrieved successfully",
  "data": [
    {
      "id": "string",
      "name": "string",
      "email": "string",
      "phone": "string",
      "gstNumber": "string",
      "address": "string",
      "town": "string",
      "balance": "number"
    }
  ],
  "success": true
}
```

---

### 3. Get Customer by ID
**Endpoint:** `GET /api/v1/customer/:id`

**Description:** Retrieve a specific customer

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Customer ID |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Customer retrieved successfully",
  "data": {
    "id": "string",
    "name": "string",
    "email": "string",
    "phone": "string",
    "gstNumber": "string",
    "address": "string",
    "town": "string",
    "balance": "number"
  },
  "success": true
}
```

**Error Responses:**
- `404`: Customer ID is required or customer not found

---

### 4. Update Customer
**Endpoint:** `PUT /api/v1/customer/:id`

**Description:** Update customer details

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Customer ID |

**Request Body:** (Same schema as Create)
```json
{
  "name": "string (optional)",
  "email": "string (optional)",
  "phone": "string (optional)",
  "gstNumber": "string (optional)",
  "address": "string (optional)",
  "town": "string (optional)"
}
```

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Customer updated successfully",
  "data": {}
}
```

**Error Responses:**
- `400`: Validation error
- `404`: Customer ID is required or customer not found

---

# SUPPLIERS API

## Base Path: `/api/v1/supplier`

### 1. Create Supplier
**Endpoint:** `POST /api/v1/supplier`

**Description:** Create a new supplier

**Request Body:**
```json
{
  "name": "string (required)",
  "contactName": "string (required)",
  "email": "string (required, valid email)",
  "phone": "string (required, min 10 digits)",
  "gstNumber": "string (required)",
  "address": "string (required)"
}
```

**Response (201):**
```json
{
  "statusCode": 201,
  "message": "Supplier created successfully",
  "data": {
    "id": "string",
    "name": "string",
    "contactName": "string",
    "email": "string",
    "phone": "string",
    "gstNumber": "string",
    "address": "string"
  },
  "success": true
}
```

**Error Responses:**
- `400`: Validation error

---

### 2. Get All Suppliers
**Endpoint:** `GET /api/v1/supplier`

**Description:** Retrieve all suppliers (ordered by name)

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Suppliers retrieved successfully",
  "data": [
    {
      "id": "string",
      "name": "string",
      "contactName": "string",
      "email": "string",
      "phone": "string",
      "gstNumber": "string",
      "address": "string"
    }
  ],
  "success": true
}
```

---

### 3. Get Supplier by ID
**Endpoint:** `GET /api/v1/supplier/:id`

**Description:** Retrieve a specific supplier

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Supplier ID |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Supplier retrieved successfully",
  "data": {
    "id": "string",
    "name": "string",
    "contactName": "string",
    "email": "string",
    "phone": "string",
    "gstNumber": "string",
    "address": "string"
  },
  "success": true
}
```

**Error Responses:**
- `400`: Supplier ID is required
- `404`: Supplier not found

---

### 4. Update Supplier
**Endpoint:** `PUT /api/v1/supplier/:id`

**Description:** Update supplier details

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Supplier ID |

**Request Body:** (Same schema as Create)
```json
{
  "name": "string (optional)",
  "contactName": "string (optional)",
  "email": "string (optional)",
  "phone": "string (optional)",
  "gstNumber": "string (optional)",
  "address": "string (optional)"
}
```

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Supplier updated successfully",
  "data": {}
}
```

**Error Responses:**
- `400`: Supplier ID is required or validation error
- `404`: Supplier not found

---

### 5. Add Supplier Payment
**Endpoint:** `POST /api/v1/supplier/payments`

**Description:** Record a payment to a supplier

**Request Body:**
```json
{
  "supplierId": "string (required)",
  "amount": "number (required, >= 0.01)",
  "paymentDate": "string (ISO date, optional, defaults to now)",
  "paymentMode": "string (required, e.g., 'Cash', 'Bank Transfer')",
  "reference": "string (required, e.g., 'CHQ-12345')"
}
```

**Response (201):**
```json
{
  "statusCode": 201,
  "message": "Supplier payment added successfully",
  "data": {
    "id": "number",
    "supplierId": "string",
    "amount": "number",
    "paymentDate": "string (ISO)",
    "paymentMode": "string",
    "reference": "string",
    "createdAt": "string (ISO)"
  },
  "success": true
}
```

**Error Responses:**
- `400`: Validation error

---

### 6. Get Supplier Payments
**Endpoint:** `GET /api/v1/supplier/payments/:id`

**Description:** Retrieve all payments for a specific supplier

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Supplier ID |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Supplier payment retrieved successfully",
  "data": [
    {
      "id": "number",
      "supplierId": "string",
      "amount": "number",
      "paymentDate": "string (ISO)",
      "paymentMode": "string",
      "reference": "string",
      "createdAt": "string (ISO)"
    }
  ],
  "success": true
}
```

**Error Responses:**
- `400`: Supplier ID is required
- `404`: Supplier not found or payment not found

---

# PURCHASES API

## Base Path: `/api/v1/purchases`

### 1. Create Purchase
**Endpoint:** `POST /api/v1/purchases`

**Description:** Create a purchase order with multiple product batches. Also updates product selling prices and maintains price history.

**Request Body:**
```json
{
  "supplierId": "string (required)",
  "invoiceNo": "string (optional)",
  "purchaseDate": "string (ISO date, optional, defaults to now)",
  "totalAmount": "number (required, positive)",
  "batches": [
    {
      "productId": "string (required)",
      "qtyReceived": "number (required, positive integer)",
      "unitCost": "number (required, positive)",
      "sellingPrice": "number (required, positive)",
      "mrp": "number (required, positive)"
    }
  ]
}
```

**Response (201):**
```json
{
  "statusCode": 201,
  "message": "Purchase created successfully",
  "data": {
    "id": "string",
    "supplierId": "string",
    "invoiceNo": "string",
    "purchaseDate": "string (ISO)",
    "totalAmount": "number",
    "createdAt": "string (ISO)",
    "batches": [
      {
        "id": "number",
        "productId": "string",
        "qtyReceived": "number",
        "qtyRemaining": "number",
        "receivedAt": "string (ISO)",
        "unitCost": "number",
        "sellingPrice": "number",
        "mrp": "number",
        "product": {
          "id": "string",
          "name": "string",
          "baseUnit": "string"
        }
      }
    ]
  },
  "success": true
}
```

**Validation Rules:**
- `supplierId`: Required, must reference existing supplier
- `batches`: Required, at least 1 batch
- `qtyReceived`: Required, positive integer
- All product IDs must reference existing products

**Error Responses:**
- `400`: Validation error
- `404`: Supplier not found or product(s) not found

**Features:**
- Automatically creates purchase batches with FIFO tracking
- Updates product selling prices if changed
- Maintains price history for audit trail

---

### 2. Get All Purchases
**Endpoint:** `GET /api/v1/purchases`

**Description:** Retrieve purchases with filtering, search, and pagination

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `supplierId` | string | Filter by supplier ID |
| `from` | string | Start date (ISO format) |
| `to` | string | End date (ISO format) |
| `invoiceNo` | string | Filter by invoice number (contains) |
| `search` | string | Search by invoice number or supplier name |
| `dateFilter` | string | Preset: `1day`, `week`, `month`, `prevmonth`, `quarter`, `all` |
| `page` | number | Page number (default: 1) |
| `limit` | number | Records per page (default: 20, max: 100) |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Purchases fetched successfully",
  "data": {
    "purchases": [
      {
        "id": "string",
        "invoiceNo": "string",
        "purchaseDate": "string (ISO)",
        "totalAmount": "number",
        "createdAt": "string (ISO)",
        "batchCount": "number",
        "supplier": {
          "id": "string",
          "name": "string"
        }
      }
    ],
    "meta": {
      "page": "number",
      "limit": "number",
      "total": "number",
      "totalPages": "number",
      "totalSpend": "number",
      "totalLineItems": "number"
    }
  },
  "success": true
}
```

**Example Requests:**
- All purchases: `GET /api/v1/purchases`
- This month: `GET /api/v1/purchases?dateFilter=month`
- Custom date: `GET /api/v1/purchases?from=2026-03-01&to=2026-04-06`
- Paginated: `GET /api/v1/purchases?page=2&limit=50`
- Search: `GET /api/v1/purchases?search=INV-2026`

---

### 3. Get Purchase by ID
**Endpoint:** `GET /api/v1/purchases/:id`

**Description:** Retrieve detailed purchase with all batches and product info

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Purchase ID |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Purchase fetched successfully",
  "data": {
    "id": "string",
    "invoiceNo": "string",
    "purchaseDate": "string (ISO)",
    "totalAmount": "number",
    "createdAt": "string (ISO)",
    "supplierId": "string",
    "supplier": {
      "id": "string",
      "name": "string"
    },
    "batches": [
      {
        "id": "number",
        "productId": "string",
        "qtyReceived": "number",
        "qtyRemaining": "number",
        "receivedAt": "string (ISO)",
        "unitCost": "number",
        "sellingPrice": "number",
        "mrp": "number",
        "product": {
          "id": "string",
          "name": "string",
          "sku": "string",
          "baseUnit": "string"
        }
      }
    ]
  },
  "success": true
}
```

**Error Responses:**
- `400`: Invalid purchase ID
- `404`: Purchase not found

---

### 4. Delete Purchase
**Endpoint:** `DELETE /api/v1/purchases/:id`

**Description:** Delete a purchase (only if no items have been sold)

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Purchase ID |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Purchase deleted successfully",
  "data": null,
  "success": true
}
```

**Error Responses:**
- `400`: Invalid purchase ID
- `404`: Purchase not found
- `409`: Cannot delete - items have already been sold

---

# SALES API

## Base Path: `/api/v1/sales`

### 1. Create Sale
**Endpoint:** `POST /api/v1/sales`

**Description:** Create a new sale with automatic FIFO batch allocation. Updates customer balance and deducts stock.

**Request Body:**
```json
{
  "customerId": "string (required)",
  "saleDate": "string (ISO date, required)",
  "lines": [
    {
      "productId": "string (required)",
      "qty": "number (required, positive integer, in base units)",
      "unitQty": "number (required, positive integer)",
      "unitName": "string (required, e.g., 'Case')",
      "unitSellPrice": "number (required, positive, price per base unit)"
    }
  ]
}
```

**Response (201):**
```json
{
  "statusCode": 201,
  "message": "Sale created successfully",
  "data": {
    "sale": {
      "id": "string",
      "invoiceNo": "string (format: DDMMYY-00001)",
      "customerId": "string",
      "saleDate": "string (ISO)",
      "totalAmount": "number",
      "customerName": "string (snapshot)",
      "customerGST": "string | null",
      "customerPhone": "string | null",
      "customerAddress": "string | null",
      "createdAt": "string (ISO)",
      "lines": [
        {
          "id": "string",
          "productId": "string",
          "productName": "string (snapshot)",
          "qty": "number",
          "unitQty": "number",
          "unitname": "string",
          "unitSellPrice": "number",
          "lineTotal": "number",
          "costAllocated": "number",
          "allocations": [
            {
              "id": "number",
              "purchaseBatchId": "number",
              "qtyAllocated": "number",
              "unitCost": "number"
            }
          ]
        }
      ]
    }
  },
  "success": true
}
```

**Validation Rules:**
- `customerId`: Required, must reference existing customer
- `saleDate`: Required, ISO format date
- `lines`: Required, at least 1 line item
- All product IDs must reference existing products
- Stock must be available in base units

**Error Responses:**
- `400`: Validation error or insufficient stock
- `404`: Customer not found or product(s) not found

**Features:**
- Auto-generates invoice number (DDMMYY-00001 format, increments daily)
- FIFO allocation from purchase batches
- Captures customer snapshot for historical accuracy
- Increments customer balance (amount owed)
- Decrements batch stock levels

---

### 2. Get All Sales
**Endpoint:** `GET /api/v1/sales`

**Description:** Retrieve sales with filtering, search, date range, and pagination

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Records per page (default: 30, max: 100) |
| `search` | string | Search by invoice number or customer name |
| `dateFilter` | string | `today`, `yesterday`, `week`, `month`, `quarter`, `year`, `custom`, `all` |
| `from` | string | Start date (ISO, used with dateFilter=custom) |
| `to` | string | End date (ISO, used with dateFilter=custom) |
| `customerId` | string | Filter by specific customer |
| `sortBy` | string | `saleDate`, `totalAmount`, `invoiceNo`, `createdAt` (default: `saleDate`) |
| `sortOrder` | string | `asc` or `desc` (default: `desc`) |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Sales fetched successfully",
  "data": {
    "sales": [
      {
        "id": "string",
        "invoiceNo": "string",
        "saleDate": "string (ISO)",
        "totalAmount": "number",
        "createdAt": "string (ISO)",
        "customerName": "string",
        "customerPhone": "string",
        "customer": {
          "id": "string",
          "name": "string",
          "phone": "string",
          "town": "string"
        },
        "_count": {
          "lines": "number"
        }
      }
    ],
    "pagination": {
      "page": "number",
      "limit": "number",
      "total": "number",
      "totalPages": "number",
      "hasNextPage": "boolean",
      "hasPrevPage": "boolean"
    }
  },
  "success": true
}
```

**Example Requests:**
- All sales: `GET /api/v1/sales`
- Today's sales: `GET /api/v1/sales?dateFilter=today`
- This month: `GET /api/v1/sales?dateFilter=month`
- Custom date: `GET /api/v1/sales?dateFilter=custom&from=2026-03-01&to=2026-04-06`
- Search: `GET /api/v1/sales?search=040426` (invoice no)
- By customer: `GET /api/v1/sales?customerId=cust-123`
- Sorted: `GET /api/v1/sales?sortBy=totalAmount&sortOrder=desc`

---

### 3. Get Sale by ID
**Endpoint:** `GET /api/v1/sales/:id`

**Description:** Retrieve detailed sale with all line items and allocations

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Sale ID |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Sale retrieved successfully",
  "data": {
    "id": "string",
    "invoiceNo": "string",
    "customerId": "string",
    "saleDate": "string (ISO)",
    "totalAmount": "number",
    "customerName": "string (snapshot)",
    "customerGST": "string | null",
    "customerPhone": "string | null",
    "customerAddress": "string | null",
    "createdAt": "string (ISO)",
    "customer": {
      "id": "string",
      "name": "string",
      "email": "string",
      "phone": "string",
      "town": "string",
      "gstNumber": "string",
      "address": "string",
      "balance": "number"
    },
    "lines": [
      {
        "id": "string",
        "saleId": "string",
        "productId": "string",
        "productName": "string",
        "qty": "number",
        "unitQty": "number",
        "unitname": "string",
        "unitSellPrice": "number",
        "taxRate": "number | null",
        "lineTotal": "number",
        "costAllocated": "number",
        "allocations": [
          {
            "id": "number",
            "purchaseBatchId": "number",
            "qtyAllocated": "number",
            "unitCost": "number"
          }
        ]
      }
    ]
  },
  "success": true
}
```

**Error Responses:**
- `400`: Invalid sale ID
- `404`: Sale not found

---

### 4. Delete Sale
**Endpoint:** `DELETE /api/v1/sales/:id`

**Description:** Delete a sale and reverse all effects (stock replenishment, customer balance reduction)

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Sale ID |

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Sale deleted successfully",
  "data": null,
  "success": true
}
```

**Error Responses:**
- `400`: Invalid sale ID
- `404`: Sale not found

---

# HEALTH CHECK

### Server Status
**Endpoint:** `GET /`

**Description:** Check if server is running

**Response (200):**
```
Hello, Server is running
```

---

# AUTHENTICATION & SECURITY

Currently, **no authentication is implemented**. All endpoints are publicly accessible.

### Recommended Security Headers
- CORS is enabled (all origins allowed)
- Cookie parser enabled
- Request body limit: 10MB

---

# COMMON HTTP STATUS CODES

| Code | Meaning |
|------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Validation error |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Operation cannot be performed (e.g., delete with dependencies) |
| 500 | Server Error - Unexpected error |

---

# PAGINATION

Endpoints supporting pagination include:
- `GET /api/v1/purchases`
- `GET /api/v1/sales`

**Parameters:**
- `page`: 1-based page number (default: 1)
- `limit`: Records per page (default varies, max: 100)

**Response includes:**
```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

# BEST PRACTICES

## Date Format
All dates should be in ISO 8601 format: `YYYY-MM-DDTHH:mm:ss.sssZ`

## Search & Filtering
- Most searches are **case-insensitive**
- Use `search` for broad queries
- Use specific filters for narrow results
- Combine filters with `&` in query string

## Stock Management
- Stock is tracked by **purchase batches** (FIFO)
- Sales automatically allocate from oldest batches first
- `qtyRemaining` decrements with each sale
- Cannot delete purchase if items have been sold

## Pricing
- `currentSellPrice`: Unit price for selling
- `unitCost`: Cost per unit from supplier
- `mrp`: Maximum Retail Price
- Price changes are tracked in history

## Customer Balance
- `balance`: Amount owed by customer
- Increments with each sale
- Should be decremented when payment received (feature not yet in API)

---

# ERROR HANDLING

Always check `success` field in response:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Error description",
  "data": null
}
```

---

# VERSION HISTORY

- **v1.0** (Current) - Initial API release with Categories, Products, Customers, Suppliers, Purchases, and Sales
