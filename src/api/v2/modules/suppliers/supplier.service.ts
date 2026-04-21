// src/api/v1/modules/supplier/supplier.service.ts

import { SupplierRepository } from './supplier.repository.js';
import ApiError from '@/helpers/ApiError.js';
import type {
    CreateSupplierInput,
    UpdateSupplierInput,
    ListSuppliersInput,
    SupplierWithRelations,
    SupplierStats,
} from './supplier.schema.js';
import type { AuthUser } from '../auth.schema';
/**
 * Service layer - Contains all business logic
 * Calls repository for data access
 * 
 * ⚠️ NOTE: All methods receive AuthUser (from middleware)
 * This ensures data isolation per user
 */
export class SupplierService {

    // ============ CREATE SUPPLIER ============
    async createSupplier(data: CreateSupplierInput, authUser: AuthUser): Promise<SupplierWithRelations> {
        // Business logic: Validate input
        if (!data.name || data.name.trim().length === 0) {
            throw new ApiError(400, 'Supplier name is required');
        }

        // Business logic: Validate opening balance
        if (data.openingBalance && data.openingBalance.toNumber() < 0) {
            throw new ApiError(400, 'Opening balance cannot be negative');
        }

        // Create supplier (with user association)
        return SupplierRepository.create({
            ...data,
            createdById: authUser.id,
        });
    }

    // ============ GET ALL SUPPLIERS ============
    async getSuppliers(params: ListSuppliersInput, authUser: AuthUser): Promise<any> {
        const { search, page, limit, sortBy, sortOrder } = params;
        const skip = (page - 1) * limit;

        // Get suppliers in parallel
        const [suppliers, total] = await Promise.all([
            SupplierRepository.findMany({
                search: search ? search.trim() : "",
                skip,
                take: limit,
                sortBy,
                sortOrder,
                createdById: authUser.id, // ← Filter by user
            }),
            SupplierRepository.count({
                search: search ? search.trim() : "",
                createdById: authUser.id,
            }),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
            data: suppliers,
            meta: {
                page,
                limit,
                totalRecords: total,
                pages: totalPages,
            },
        };
    }

    // ============ GET SUPPLIER BY ID ============
    async getSupplierById(id: string, authUser: AuthUser): Promise<SupplierWithRelations> {
        // Business logic: Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, 'Supplier ID is required');
        }

        const supplier = await SupplierRepository.findById(id);

        if (!supplier) {
            throw new ApiError(404, 'Supplier not found');
        }

        // ⚠️ SECURITY: Verify user owns this supplier
        if (supplier.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this supplier');
        }

        return supplier;
    }

    // ============ UPDATE SUPPLIER ============
    async updateSupplier(
        id: string,
        data: UpdateSupplierInput,
        authUser: AuthUser
    ): Promise<SupplierWithRelations> {
        // Business logic: Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, 'Invalid supplier ID');
        }

        // Verify supplier exists
        const existingSupplier = await SupplierRepository.findByIdMinimal(id);
        if (!existingSupplier) {
            throw new ApiError(404, 'Supplier not found');
        }

        // ⚠️ SECURITY: Verify user owns this supplier
        if (existingSupplier.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this supplier');
        }

        // Update the supplier
        return SupplierRepository.update(id, data);
    }

    // ============ DELETE SUPPLIER ============
    async deleteSupplier(id: string, authUser: AuthUser): Promise<void> {
        // Business logic: Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, 'Invalid supplier ID');
        }

        // Verify supplier exists
        const existingSupplier = await SupplierRepository.findByIdMinimal(id);
        if (!existingSupplier) {
            throw new ApiError(404, 'Supplier not found');
        }

        // ⚠️ SECURITY: Verify user owns this supplier
        if (existingSupplier.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this supplier');
        }

        // Business logic: Check if supplier has transactions
        const hasTransactions = await SupplierRepository.hasTransactions(id);
        if (hasTransactions) {
            throw new ApiError(400, 'Cannot delete supplier with existing purchases or payments');
        }

        // Delete the supplier
        await SupplierRepository.delete(id);
    }

    // ============ GET SUPPLIER STATISTICS ============
    async getSupplierStats(id: string, authUser: AuthUser): Promise<SupplierStats> {
        // Business logic: Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, 'Supplier ID is required');
        }

        const supplier = await SupplierRepository.findByIdMinimal(id);
        if (!supplier) {
            throw new ApiError(404, 'Supplier not found');
        }

        // ⚠️ SECURITY: Verify user owns this supplier
        if (supplier.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this supplier');
        }

        // Get stats
        const stats = await SupplierRepository.getSupplierStats(id);
        if (!stats) {
            throw new ApiError(404, 'Supplier not found');
        }

        return {
            supplierId: id,
            supplierName: supplier.name,
            totalPurchases: stats.totalPurchases,
            totalPayments: stats.totalPayments,
            outstandingBalance: supplier.balance.toNumber(),
            lastPurchaseDate: stats.lastPurchaseDate?.toISOString() || null,
            totalTransactions: stats.purchaseCount + stats.paymentCount,
        };
    }

    // ============ GET SUPPLIERS WITH BALANCE ============
    async getSuppliersWithBalance(authUser: AuthUser): Promise<any[]> {
        const suppliers = await SupplierRepository.findMany({
            createdById: authUser.id,
        });

        return suppliers.map((supplier) => ({
            id: supplier.id,
            name: supplier.name,
            balance: supplier.balance.toNumber(),
            openingBalance: supplier.openingBalance.toNumber(),
            contactName: supplier.contactName,
            phone: supplier.phone,
            email: supplier.email,
        }));
    }

    // ============ GET HIGH PAYABLE SUPPLIERS ============
    async getHighPayableSuppliers(threshold: number, authUser: AuthUser): Promise<any[]> {
        // Business logic: Validate threshold
        if (threshold < 0) {
            throw new ApiError(400, 'Threshold cannot be negative');
        }

        const suppliers = await SupplierRepository.findMany({
            createdById: authUser.id,
        });

        // Filter suppliers with balance >= threshold
        return suppliers
            .filter((s) => s.balance.toNumber() >= threshold)
            .sort((a, b) => b.balance.toNumber() - a.balance.toNumber())
            .map((supplier) => ({
                id: supplier.id,
                name: supplier.name,
                balance: supplier.balance.toNumber(),
                openingBalance: supplier.openingBalance.toNumber(),
                contactName: supplier.contactName,
                phone: supplier.phone,
            }));
    }
}