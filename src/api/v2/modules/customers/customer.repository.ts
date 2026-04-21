import PrismaClient from '@/prismaClient/index.js';
import type { Customer, CreateCustomerInput, UpdateCustomerInput } from './customer.schema.js';
import type { Prisma } from '@/lib/generated/prisma/browser.js';


export class CustomerRepository {

    // Create a new customer
    static async create(data: CreateCustomerInput, createdById: string): Promise<Customer> {
        return PrismaClient.customer.create({
            data: {
                name: data.name,
                email: data.email,
                phone: data.phone,
                gstNumber: data.gstNumber,
                address: data.address,
                openingBalance: data.openingBalance,
                balance: data.openingBalance,
                town: data.town,
                createdById,
            }
        });
    }

    // Find a customers
    static async findMany(skip: number, take: number, createdById: string, search?: string): Promise<Customer[]> {
        return PrismaClient.customer.findMany({
            skip,
            take,
            where: search ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } },
                ],
                AND: [
                    { createdById }
                ]
            } : {},
            orderBy: { createdAt: 'desc' },
        });
    }

    // Count total customers (with optional search)
    static async count(createdById: string, search?: string): Promise<number> {
        return PrismaClient.customer.count({
            where: search ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } },
                ],
                AND: [
                    { createdById }
                ]
            } : {},
        });
    }

    // Find a customer by ID
    static async findById(id: string, createdById: string): Promise<Customer | null> {
        return PrismaClient.customer.findUnique({
            where: { id, createdById },
        });
    }

    // Update a customer
    static async update(id: string, data: UpdateCustomerInput): Promise<Customer> {
        return PrismaClient.customer.update({
            where: { id },
            data: data as Prisma.CustomerUpdateInput
        });
    }

    // ============ UPDATE BALANCE ============
    static async updateBalance(id: string, amount: number, createdById: string): Promise<Customer> {
        return PrismaClient.customer.update({
            where: { id, createdById },
            data: { balance: amount },
        });
    }


}