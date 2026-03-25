import ApiError from "../helpers/ApiError.js";

const asyncHandler = (reqHandler: any) => {
    return async (req: any, res: any, next: any) => {
        try {
            await reqHandler(req, res, next);
        } catch (error) {
            console.log(error)
            if (error instanceof ApiError) {
                res.status(error.statusCode).json({
                    success: error.success,
                    message: error.message,
                    errors: error.errors
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: "Internal Server Error"
                });
            }
        }
    };
};

export default asyncHandler;