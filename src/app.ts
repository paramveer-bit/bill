import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import exp from "constants"
import { errorHandler } from "./middlewares/errorHandler.js"
// import PrismaClient from "./prismaClient/index"
// const UAParser = require("ua-parser-js");




const app = express()

app.use(cookieParser())

app.use(cors({
    origin: true,
    credentials: true,
}))

app.get("/", (req, res) => {
    const userAgent = req.headers["user-agent"];
    // const parser = new UAParser(userAgent);
    // const result = parser.getResult();
    // console.log(parser);
    // console.log(result);
    res.status(200).send("Hello, Server is running")
}
)


app.use(express.json())
app.use(express.urlencoded({ extended: true, limit: "10mb" }))
app.use(express.static("public"))
app.use(errorHandler) // Global error handler - should be last middleware
// Router import
// import customerRouter from "./api/v1/routers/coustomer.router.js"
// import supplierRouter from "./api/v1/routers/supplier.router.js"
// import categoriesRouter from "./api/v1/routers/categories.router.js"
// import productRouter from "./api/v1/routers/product.router.js"
// import purchaseRouter from "./api/v1/routers/purchase.router.js"
// import salesMaster from "./api/v1/routers/sales.router.js"
// import receiptRouter from "./api/v1/routers/receipt.router.js"

// // Roueters
// app.use("/api/v1/customer", customerRouter)
// app.use("/api/v1/supplier", supplierRouter)
// app.use("/api/v1/categories", categoriesRouter)
// app.use("/api/v1/products", productRouter)
// app.use("/api/v1/purchases", purchaseRouter)
// app.use("/api/v1/sales", salesMaster)
// app.use("/api/v1/receipts", receiptRouter)
// // app.use("/api/v1/", rateLimitingRouter)


import customerRouterV2 from "./api/v2/modules/customers/customer.router.js"
import supplierRouterPaymetV2 from "./api/v2/modules/supplier-payments/supplier-payment.router.js"
import supplierRouterV2 from "./api/v2/modules/suppliers/supplier.router.js"
import categoriesRouterV2 from "./api/v2/modules/categories/category.router.js"
import productRouterV2 from "./api/v2/modules/products/product.router.js"
import purchaseRouterV2 from "./api/v2/modules/purchase/purchase.router.js"
import salesMasterV2 from "./api/v2/modules/sales/sale.router.js"
import receiptRouterV2 from "./api/v2/modules/receipt/receipt.router.js"
import authRouter from "./api/v2/modules/auth/auth.router.js"

app.use("/api/v2/customers", customerRouterV2)
app.use("/api/v2/supplier-payments", supplierRouterPaymetV2)//checked and implemented
app.use("/api/v2/suppliers", supplierRouterV2)//checked and implemented
app.use("/api/v2/categories", categoriesRouterV2)//checked and implemented
app.use("/api/v2/products", productRouterV2)
app.use("/api/v2/purchases", purchaseRouterV2)//checked and implemented
app.use("/api/v2/sales", salesMasterV2)//checked and implemented
app.use("/api/v2/receipts", receiptRouterV2)//checked and implemented
app.use("/api/v2/auth", authRouter)//checked and implemented





export default app