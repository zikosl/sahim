import type { Dispatch, SetStateAction } from 'react'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import { Button, Chip, Field } from '../components/ui'
import { styles } from '../components/styles'
import { CatalogItem, ProductDraft } from '../domain/catalog'

type Props = {
  catalog: CatalogItem[]
  catalogLoading: boolean
  catalogError: string
  onRetryCatalog: () => void
  product: ProductDraft
  setProduct: Dispatch<SetStateAction<ProductDraft>>
  step: number
  setStep: (step: number) => void
  categoryFilter: string
  setCategoryFilter: (value: string) => void
  brandFilter: string
  setBrandFilter: (value: string) => void
  onPickPhoto: () => void
  onPickVariantPhoto: (index: number) => void
  onScanVariant: (index: number) => void
  onSaveDraft: () => void
  onContinue: () => void
}

export function ProductWizardScreen({ catalog, catalogLoading, catalogError, onRetryCatalog, product, setProduct, step, setStep, categoryFilter, setCategoryFilter, brandFilter, setBrandFilter, onPickPhoto, onPickVariantPhoto, onScanVariant, onSaveDraft, onContinue }: Props) {
  const niche = catalog.find((item) => item.id === product.nicheId)
  const category = niche?.categories.categories.find((item) => item.id === product.categoryId)

  return <>
    <ScrollView contentContainerStyle={[styles.content, styles.wizardContent]} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>Product · Step {step + 1} of 4</Text><View style={styles.progress}><View style={[styles.progressFill, { width: `${(step + 1) * 25}%` }]} /></View>
      {step === 0 ? <>
        <Text style={styles.title}>Where does it belong?</Text><Text style={styles.subtitle}>Choose a niche and category. Product type and brand are optional.</Text>
        {!catalog.length ? <><Text style={styles.warning}>{catalogLoading ? 'Loading catalog...' : catalogError ? `Could not load catalog: ${catalogError}` : 'No niches are available yet. Your draft is safe on this device.'}</Text><Button title={catalogLoading ? 'Loading...' : 'Retry catalog'} secondary disabled={catalogLoading} onPress={onRetryCatalog} /></> : null}
        <Text style={styles.fieldLabel}>Niche</Text><View style={styles.chips}>{catalog.map((item) => <Chip key={item.id} title={item.name} selected={product.nicheId === item.id} onPress={() => { setCategoryFilter(''); setBrandFilter(''); setProduct((current) => ({ ...current, nicheId: item.id, categoryId: 0, productTypeId: 0, brandId: 0 })) }} />)}</View>
        {niche ? <><Text style={styles.fieldLabel}>Category</Text>{niche.categories.categories.length > 8 ? <Field label="Find category" value={categoryFilter} onChangeText={setCategoryFilter} placeholder="Type a name" /> : null}<View style={styles.chips}>{niche.categories.categories.filter((item) => item.name.toLowerCase().includes(categoryFilter.toLowerCase()) || item.id === product.categoryId).map((item) => <Chip key={item.id} title={item.name} selected={product.categoryId === item.id} onPress={() => setProduct((current) => ({ ...current, categoryId: item.id, productTypeId: 0 }))} />)}</View></> : null}
        {category?.productTypes.productTypes.length ? <><Text style={styles.fieldLabel}>Product type (optional)</Text><View style={styles.chips}>{category.productTypes.productTypes.map((item) => <Chip key={item.id} title={item.name} selected={product.productTypeId === item.id} onPress={() => setProduct((current) => ({ ...current, productTypeId: current.productTypeId === item.id ? 0 : item.id }))} />)}</View></> : null}
        {niche?.brands.brands.length ? <><Text style={styles.fieldLabel}>Brand (optional)</Text>{niche.brands.brands.length > 8 ? <Field label="Find brand" value={brandFilter} onChangeText={setBrandFilter} placeholder="Type a name" /> : null}<View style={styles.chips}>{niche.brands.brands.filter((item) => item.name.toLowerCase().includes(brandFilter.toLowerCase()) || item.id === product.brandId).map((item) => <Chip key={item.id} title={item.name} selected={product.brandId === item.id} onPress={() => setProduct((current) => ({ ...current, brandId: current.brandId === item.id ? 0 : item.id }))} />)}</View></> : null}
      </> : null}
      {step === 1 ? <>
        <Text style={styles.title}>Show the product.</Text><Text style={styles.subtitle}>A clear package photo helps the admin verify it.</Text>
        <Field label="Product name" value={product.name} onChangeText={(name) => setProduct((current) => ({ ...current, name }))} placeholder="Name on the package" />
        <Field label="Arabic name (optional)" value={product.nameAr} onChangeText={(nameAr) => setProduct((current) => ({ ...current, nameAr }))} />
        <Pressable accessibilityRole="button" style={styles.photoBox} onPress={onPickPhoto}>{product.image ? <Image source={{ uri: product.image }} style={styles.photo} /> : <Text style={styles.photoHint}>+ Photograph product</Text>}</Pressable>
      </> : null}
      {step === 2 ? <>
        <Text style={styles.title}>Add variants.</Text><Text style={styles.subtitle}>Give each size or format a name and tags. Scan its barcode if available.</Text>
        {product.variants.map((variant, index) => <View style={styles.variantCard} key={index}>
          <Text style={styles.fieldLabel}>Variant {index + 1}</Text>
          <Field label="Name" value={variant.name} onChangeText={(name) => setProduct((current) => ({ ...current, variants: current.variants.map((v, i) => i === index ? { ...v, name } : v) }))} placeholder="e.g. 250 ml" />
          <Field label="Tags, separated by commas" value={variant.tags} onChangeText={(tags) => setProduct((current) => ({ ...current, variants: current.variants.map((v, i) => i === index ? { ...v, tags } : v) }))} placeholder="Size, scent, color" />
          <Field label="SKU (optional)" value={variant.sku} onChangeText={(sku) => setProduct((current) => ({ ...current, variants: current.variants.map((v, i) => i === index ? { ...v, sku } : v) }))} />
          <Field label="Barcode (optional)" value={variant.barcode} onChangeText={(barcode) => setProduct((current) => ({ ...current, variants: current.variants.map((v, i) => i === index ? { ...v, barcode } : v) }))} keyboardType="number-pad" />
          <Pressable accessibilityRole="button" onPress={() => onScanVariant(index)}><Text style={styles.link}>Scan barcode with camera</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => onPickVariantPhoto(index)} style={styles.variantPhotoAction}>{variant.image ? <Image source={{ uri: variant.image }} style={styles.variantPhoto} /> : null}<Text style={styles.link}>{variant.image ? 'Change variant photo' : 'Add variant photo (optional)'}</Text></Pressable>
          {product.variants.length > 1 ? <Pressable accessibilityRole="button" onPress={() => setProduct((current) => ({ ...current, variants: current.variants.filter((_, i) => i !== index) }))}><Text style={styles.danger}>Remove variant</Text></Pressable> : null}
        </View>)}
        <Button title="+ Add another variant" secondary onPress={() => setProduct((current) => ({ ...current, variants: [...current.variants, { name: '', tags: '', sku: '', barcode: '', image: '' }] }))} />
      </> : null}
      {step === 3 ? <><Text style={styles.title}>Ready for review.</Text><Text style={styles.subtitle}>Your submission is saved on this device first. It will appear in the catalog only after admin approval.</Text><View style={styles.summary}><Text style={styles.rowTitle}>{product.name}</Text><Text style={styles.rowHint}>{niche?.name} / {category?.name}</Text><Text style={styles.rowHint}>{product.variants.length} variant{product.variants.length !== 1 ? 's' : ''}</Text>{product.image ? <Image source={{ uri: product.image }} style={styles.summaryImage} /> : null}</View></> : null}
    </ScrollView>
    <View style={styles.wizardActions}><View style={styles.wizardButton}><Button title={step > 0 ? 'Back' : 'Save draft'} secondary onPress={() => step > 0 ? setStep(step - 1) : onSaveDraft()} /></View><View style={styles.wizardButton}><Button title={step === 3 ? 'Submit' : 'Continue'} onPress={onContinue} /></View></View>
  </>
}
