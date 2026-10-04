import { CameraView } from 'expo-camera'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Button, Field } from '../components/ui'
import { styles } from '../components/styles'

type Props = {
  cameraGranted: boolean
  torch: boolean
  manualCode: string
  manualError: string
  lookupLoading: boolean
  onAllowCamera: () => void
  onTorchChange: () => void
  onManualCodeChange: (value: string) => void
  onScannedCode: (value: string) => void
  onManualSubmit: () => void
}

export function ScanScreen({ cameraGranted, torch, manualCode, manualError, lookupLoading, onAllowCamera, onTorchChange, onManualCodeChange, onScannedCode, onManualSubmit }: Props) {
  return <View style={styles.scannerScreen}>
    <Text style={styles.title}>Scan barcode</Text><Text style={styles.subtitle}>Point at the product code or enter it below.</Text>
    <View style={styles.cameraBox}>{cameraGranted ? <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] }} onBarcodeScanned={manualCode.trim() ? undefined : ({ data }) => onScannedCode(data)} /> : <View style={styles.center}><Text style={styles.empty}>Camera access is needed to scan.</Text><Button title="Allow camera" onPress={onAllowCamera} /></View>}<View pointerEvents="none" style={styles.scanFrame} /></View>
    <Pressable accessibilityRole="button" style={styles.torchAction} onPress={onTorchChange}><Text style={styles.link}>{torch ? 'Turn light off' : 'Turn light on'}</Text></Pressable>
    <Field label="Enter code instead" value={manualCode} onChangeText={onManualCodeChange} keyboardType="number-pad" placeholder="EAN, UPC or GTIN" error={manualError} onSubmitEditing={onManualSubmit} />
    <Button title="Use this code" onPress={onManualSubmit} disabled={!manualCode.trim() || lookupLoading} />
  </View>
}
