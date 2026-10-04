export type ProductType = { id: number; name: string }
export type Category = { id: number; name: string; productTypes: { productTypes: ProductType[] } }
export type Brand = { id: number; name: string }
export type CatalogItem = { id: number; name: string; categories: { categories: Category[] }; brands: { brands: Brand[] } }
export type Template = { id: number; name: string; description?: string | null; variants: { id: number; name: string | null; barcode: string | null }[] }

export const makeProduct = (barcode = '') => ({
  nicheId: 0, categoryId: 0, productTypeId: 0, brandId: 0,
  name: '', nameAr: '', image: '',
  variants: [{ name: '', tags: '', sku: '', barcode, image: '' }],
})

export type ProductDraft = ReturnType<typeof makeProduct>
