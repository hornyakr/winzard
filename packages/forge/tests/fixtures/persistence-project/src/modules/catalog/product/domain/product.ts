export type ProductId = string & { readonly __brand: 'ProductId' };
export type TenantId = string & { readonly __brand: 'TenantId' };
export type ProductStatus = 'draft' | 'active' | 'archived';

export type ProductState = Readonly<{
  id: ProductId;
  tenantId: TenantId;
  name: string;
  slug: string;
  priceMinor: number;
  currency: string;
  status: ProductStatus;
  version: number;
  deletedAt: Date | null;
}>;

export class Product {
  private constructor(private state: ProductState) {}

  static restore(state: ProductState): Product {
    return new Product(Object.freeze({ ...state }));
  }

  get snapshot(): ProductState {
    return this.state;
  }

  rename(name: string, slug: string): void {
    const normalizedName = name.trim();
    if (normalizedName.length === 0 || normalizedName.length > 200) throw new RangeError('Invalid product name.');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) throw new RangeError('Invalid product slug.');
    this.state = Object.freeze({ ...this.state, name: normalizedName, slug });
  }
}
