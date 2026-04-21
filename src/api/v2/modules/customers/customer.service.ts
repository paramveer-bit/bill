import { CustomerRepository } from './customer.repository.js';
import ApiError from '@/helpers/ApiError.js';
import type {
    Customer,
    CreateCustomerInput,
    UpdateCustomerInput,
    ListCustomersInput,
} from './customer.schema';
import type { AuthUser } from '../auth.schema.js';


export class CustomerService {
    async createCustomer(data: CreateCustomerInput, authUser: AuthUser): Promise<Customer> {
        // Create the customer
        const customer = await CustomerRepository.create(data, authUser.id);
        return customer;
    }

    async listCustomers(params: ListCustomersInput, authUser: AuthUser) {
        const { page = 1, limit = 10, search } = params;
        const skip = (page - 1) * limit;
        const [customers, totalRecords] = await Promise.all([
            CustomerRepository.findMany(skip, limit, authUser.id, search),
            CustomerRepository.count(authUser.id, search),
        ]);

        return {
            data: customers,
            pagination: {
                page,
                limit,
                totalRecords,
                totalPages: Math.ceil(totalRecords / limit),
            },
        };
    }

    async getCustomerById(id: string, authUser: AuthUser): Promise<Customer> {

        const customer = await CustomerRepository.findById(id, authUser.id);

        if (!customer) {
            throw new ApiError(404, 'Customer not found');
        }
        return customer;
    }

    async updateCustomer(id: string, data: UpdateCustomerInput, authUser: AuthUser): Promise<Customer> {
        // Check if customer exists
        const existingCustomer = await CustomerRepository.findById(id, authUser.id);
        if (!existingCustomer) {
            throw new ApiError(404, 'Customer not found');
        }
        // Update the customer
        const updatedCustomer = await CustomerRepository.update(id, data);
        return updatedCustomer;
    }
}
