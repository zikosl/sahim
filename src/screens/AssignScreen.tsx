import { useState } from 'react'
import { ActivityIndicator, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { Button } from '../components/ui'
import { styles } from '../components/styles'
import { Template } from '../domain/catalog'
import { colors } from '../theme'

type Props = {
  code: string
  lookupLoading: boolean
  busy: boolean
  searching: boolean
  searchError: string
  search: string
  results: Template[]
  onSearchChange: (value: string) => void
  onSelectVariant: (id: number) => void
  onAddProduct: () => void
}

export function AssignScreen({ code, lookupLoading, busy, searching, searchError, search, results, onSearchChange, onSelectVariant, onAddProduct }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const hasQuery = search.trim().length >= 2
  const visibleResults = showAll ? results : results.slice(0, 6)

  function changeSearch(value: string) {
    setSelectedId(null)
    setShowAll(false)
    onSearchChange(value)
  }

  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>{lookupLoading ? 'Checking code' : 'Scanned code'}</Text>
    <Text style={styles.code}>{code}</Text>
    <Text style={styles.subtitle}>Find the product, then choose the variant for this barcode.</Text>

    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Find product</Text>
      <View style={styles.searchField}>
        <TextInput
          value={search}
          onChangeText={changeSearch}
          placeholder="Name or description"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          onSubmitEditing={() => Keyboard.dismiss()}
          autoCorrect={false}
          accessibilityLabel="Search products by name or description"
          style={styles.searchInput}
        />
        {searching ? <ActivityIndicator size="small" color={colors.green} /> : search ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => changeSearch('')} style={styles.clearSearch}><Text style={styles.clearSearchText}>×</Text></Pressable> : null}
      </View>
    </View>

    {!hasQuery ? <Text style={styles.rowHint}>Type at least 2 characters to see suggestions.</Text> : null}
    {hasQuery && !searching && searchError ? <Text style={styles.warning}>{searchError}</Text> : null}
    {hasQuery && !searching && !searchError && results.length === 0 ? <Text style={styles.rowHint}>No matching products. Try another name or add a new product.</Text> : null}
    {results.length > 0 ? <View style={styles.suggestionList}>
      <Text style={styles.suggestionHeading}>Suggestions</Text>
      {visibleResults.map((item) => {
        const selected = item.id === selectedId
        const available = item.variants.filter((variant) => !variant.barcode)
        return <View key={item.id} style={styles.suggestionItem}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: selected }} onPress={() => { setSelectedId(selected ? null : item.id); Keyboard.dismiss() }} style={styles.suggestionRow}>
            <View style={styles.suggestionCopy}>
              <Text style={styles.rowTitle} numberOfLines={2}>{item.name}</Text>
              {item.description?.trim() ? <Text style={styles.suggestionDescription} numberOfLines={selected ? undefined : 2}>{item.description.trim()}</Text> : null}
              <Text style={styles.rowHint}>{available.length ? `${available.length} variant${available.length === 1 ? '' : 's'} without a code` : 'All variants have codes'}</Text>
            </View>
            <Text style={styles.suggestionChevron}>{selected ? '⌃' : '⌄'}</Text>
          </Pressable>
          {selected ? <View style={styles.suggestionVariants}>
            {available.map((variant) => <Pressable accessibilityRole="button" key={variant.id} disabled={lookupLoading || busy} onPress={() => onSelectVariant(variant.id)} style={[styles.variantPick, (lookupLoading || busy) && styles.disabled]}><Text style={styles.resultVariant}>{variant.name || 'Default variant'}</Text><Text style={styles.link}>Assign code</Text></Pressable>)}
            {!available.length ? <Text style={styles.rowHint}>Choose another product or add a new one.</Text> : null}
          </View> : null}
        </View>
      })}
      {!showAll && results.length > 6 ? <Pressable accessibilityRole="button" onPress={() => setShowAll(true)} style={styles.moreSuggestions}><Text style={styles.link}>Show {results.length - 6} more</Text></Pressable> : null}
    </View> : null}

    <View style={styles.divider} />
    <Text style={styles.sectionTitle}>Not in the catalog?</Text>
    <Button title="Add product with this code" secondary disabled={lookupLoading || busy} onPress={onAddProduct} />
  </ScrollView>
}
