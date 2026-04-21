import { CategoryRepository } from './category.repository.js';
import ApiError from '@/helpers/ApiError.js';
import type {
    CreateCategoryInput,
    UpdateCategoryInput,
    ListCategoriesInput,
    CategoryWithRelations,
} from './category.schema.js';
import type { AuthUser } from '../auth.schema.js';
export class CategoryService {
    // ============ CREATE CATEGORY ============
    async createCategory(data: CreateCategoryInput, authUser: AuthUser): Promise<CategoryWithRelations> {
        // Business logic: Validate parent category if provided
        if (data.parentId) {
            const parent = await CategoryRepository.findByIdMinimal(data.parentId, authUser.id);

            if (!parent) {
                throw new ApiError(404, 'Parent category not found');
            }

            // Business logic: Prevent nesting beyond 2 levels
            // (parent can't have a parent, i.e., can't be a subcategory)
            if (parent.parentId !== null) {
                throw new ApiError(400,
                    'Cannot create category under a subcategory (max 2 levels)'
                );
            }
        }
        return CategoryRepository.create(data, authUser.id);

    }

    // ============ UPDATE CATEGORY ============
    async updateCategory(
        id: string,
        data: UpdateCategoryInput,
        authUser: AuthUser
    ): Promise<CategoryWithRelations> {
        // Business logic: Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, 'Invalid category ID');
        }

        // Business logic: Verify category exists
        const existingCategory = await CategoryRepository.findByIdMinimal(id, authUser.id);
        if (!existingCategory) {
            throw new ApiError(404, 'Category not found');
        }

        // Business logic: Validate parent ID if provided
        if (data.parentId) {
            // Can't be its own parent
            if (data.parentId === id) {
                throw new ApiError(400, 'Category cannot be its own parent');
            }

            // Parent must exist
            const parent = await CategoryRepository.findByIdMinimal(data.parentId, authUser.id);
            if (!parent) {
                throw new ApiError(404, 'Parent category not found');
            }

            // Parent can't be a subcategory (max 2 levels)
            if (parent.parentId !== null) {
                throw new ApiError(400,
                    'Cannot nest under a subcategory (max 2 levels)'
                );
            }
        }
        return CategoryRepository.update(id, data, authUser.id);
    }

    // ============ DELETE CATEGORY ============
    async deleteCategory(id: string, authUser: AuthUser): Promise<void> {
        // Business logic: Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, 'Invalid category ID');
        }

        // Business logic: Verify category exists
        const existingCategory = await CategoryRepository.findByIdMinimal(id, authUser.id);
        if (!existingCategory) {
            throw new ApiError(404, 'Category not found');
        }

        // Get all child categories (to delete them too)
        const children = await CategoryRepository.findChildren(id, authUser.id);
        const childIds = children.map(c => c.id);

        // Business logic: Delete with cascade
        // This deletes the category, its subcategories, and nullifies product references
        await CategoryRepository.deleteWithChildren(id, childIds, authUser.id);
    }

    // ============ GET ALL CATEGORIES ============
    async getCategories(params: ListCategoriesInput, authUser: AuthUser): Promise<any> {
        // Business logic: Return flat or hierarchical based on query param
        if (params.flat) {
            const categories = await CategoryRepository.findManyFlat(authUser.id);
            return {
                format: 'flat',
                count: categories.length,
                data: categories,
            };
        }

        // Default: hierarchical
        const categories = await CategoryRepository.findManyHierarchical(authUser.id);
        return {
            format: 'hierarchical',
            count: categories.length,
            data: categories,
        };
    }

    // ============ GET SINGLE CATEGORY BY ID ============
    async getCategoryById(id: string, authUser: AuthUser): Promise<CategoryWithRelations> {
        // Business logic: Validate ID provided
        if (!id?.trim()) {
            throw new ApiError(400, 'Category ID is required');
        }

        // Fetch category with all relations
        const category = await CategoryRepository.findById(id, authUser.id);

        if (!category) {
            throw new ApiError(404, 'Category not found');
        }

        return category;
    }

}