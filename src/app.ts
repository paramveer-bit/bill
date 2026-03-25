import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import exp from "constants"
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

// Router import
import customerRouter from "./routers/coustomer.router.js"
import supplierRouter from "./routers/supplier.router.js"
import categoriesRouter from "./routers/categories.router.js"
import productRouter from "./routers/product.router.js"
// import requestRouter from "./routers/request.router"


// Roueters
app.use("/api/v1/customer", customerRouter)
app.use("/api/v1/supplier", supplierRouter)
app.use("/api/v1/categories", categoriesRouter)
app.use("/api/v1/products", productRouter)
// app.use("/sendHere", requestProccessorRouter)
// app.use("/api/v1/requestLog", requestLogRouter)
// app.use("/api/v1/rateLimiting", rateLimitingRouter)





export default app