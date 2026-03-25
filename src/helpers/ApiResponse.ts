class ApiResponse {
    statusCode: string;
    data: any;
    message: string;
    success: boolean;

    constructor(statusCode: string, data: any, message = "Success") {
        this.statusCode = statusCode;
        this.data = data;
        this.message = message;
        this.success = parseInt(statusCode) < 400;
    }
}

export default ApiResponse 