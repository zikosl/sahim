import { Pressable, ScrollView, Text, View } from 'react-native'
import { Draft } from '../storage'
import { ScanSymbol } from '../components/ui'
import { styles } from '../components/styles'

type Props = {
  drafts: Draft[]
  syncing: boolean
  onScan: () => void
  onAddProduct: () => void
  onSync: () => void
  onResume: (item: Draft) => void
  onEditError: (item: Draft) => void
  onDeleteDraft: (item: Draft) => void
}

export function HomeScreen({ drafts, syncing, onScan, onAddProduct, onSync, onResume, onEditError, onDeleteDraft }: Props) {
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Contribute</Text>
    <Pressable accessibilityRole="button" style={styles.scanCard} onPress={onScan}><ScanSymbol /><View style={{ flex: 1 }}><Text style={styles.scanCardTitle}>Scan barcode</Text><Text style={styles.scanCardHint}>Check or assign a product code</Text></View><Text style={styles.scanArrow}>›</Text></Pressable>
    <Pressable accessibilityRole="button" style={styles.addRow} onPress={onAddProduct}><Text style={styles.addRowText}>Add a product</Text><Text style={styles.addRowArrow}>+</Text></Pressable>
    <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Your work</Text><Text style={styles.sectionHint}>{drafts.filter((item) => item.status === 'queued').length} waiting to sync</Text></View><Pressable accessibilityRole="button" hitSlop={10} onPress={onSync} disabled={syncing}><Text style={styles.link}>{syncing ? 'Syncing...' : 'Sync now'}</Text></Pressable></View>
    {!drafts.length ? <Text style={styles.empty}>No work yet. Scan a barcode to begin.</Text> : drafts.map((item) => {
      const canEdit = (item.status === 'draft' && item.kind === 'PRODUCT') || item.status === 'error'
      const canDelete = item.status === 'draft' || item.status === 'error'
      return <View key={item.localId} style={styles.rowCard}>
        <Pressable accessibilityRole={canEdit ? 'button' : undefined} disabled={!canEdit} style={{ flex: 1 }} onPress={() => item.status === 'draft' ? onResume(item) : onEditError(item)}>
          <Text style={styles.rowTitle}>{item.kind === 'BARCODE' ? item.input.barcode : item.input.name || 'Untitled product'}</Text>
          <Text style={styles.rowHint}>{item.message || (item.status === 'queued' ? 'Saved on this device, waiting to sync' : item.status === 'draft' ? 'Draft saved on this device' : item.status === 'pending' ? 'Awaiting admin review' : item.status)}</Text>
          {item.status === 'error' ? <Text style={styles.link}>Review and correct</Text> : null}
        </Pressable>
        {canDelete ? <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.kind === 'PRODUCT' ? item.input.name || 'product draft' : 'barcode draft'}`} style={styles.deleteAction} onPress={() => onDeleteDraft(item)}><Text style={styles.deleteText}>Delete</Text></Pressable>
          : <Text style={[styles.status, item.status === 'approved' && styles.statusApproved]}>{item.status}</Text>}
      </View>
    })}
  </ScrollView>
}
