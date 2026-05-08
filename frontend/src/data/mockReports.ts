import type { VisualField } from '../types/api'

export type AssessmentStatus = 'pass' | 'fail' | 'warning' | 'not-assessed' | 'in-progress'

export interface MockVisual {
  id: string
  title: string
  type: string
  assessmentStatus: AssessmentStatus
  mockValue?: string
  mockSubtitle?: string
  fields?: VisualField[]
  // Canvas positioning (pixels in page coordinate space)
  x?: number
  y?: number
  width?: number
  height?: number
  text_content?: string
}

export interface MockPage {
  id: string
  name: string
  visuals: MockVisual[]
  page_width?: number
  page_height?: number
}

export interface MockReport {
  id: string
  name: string
  lastRefreshed: string
  pageCount: number
  assessmentStatus: AssessmentStatus
  workspaceName: string
  pages: MockPage[]
}

// ── Layout helper ─────────────────────────────────────────────────────────────
// Assigns realistic Power BI-style positions to a set of visuals given a page canvas size.

function layoutPage(
  visuals: Omit<MockVisual, 'x' | 'y' | 'width' | 'height'>[],
  pageWidth = 1280,
  pageHeight = 720,
): MockVisual[] {
  const PAD = 10
  const items = visuals.map(v => ({ ...v }) as MockVisual)

  const slicers = items.filter(v => v.type.toLowerCase() === 'slicer')
  const kpis    = items.filter(v => ['kpi card', 'card', 'kpi'].includes(v.type.toLowerCase()))
  const tables  = items.filter(v => ['table', 'matrix', 'pivottable'].includes(v.type.toLowerCase()))
  const charts  = items.filter(v => !slicers.includes(v) && !kpis.includes(v) && !tables.includes(v))

  let y = PAD

  // Row 1 — slicers across top
  if (slicers.length) {
    const h = 50
    const w = Math.floor((pageWidth - PAD * (slicers.length + 1)) / slicers.length)
    slicers.forEach((v, i) => { v.x = PAD + i * (w + PAD); v.y = y; v.width = w; v.height = h })
    y += h + PAD
  }

  // Row 2 — KPI cards
  if (kpis.length) {
    const h = 96
    const w = Math.floor((pageWidth - PAD * (kpis.length + 1)) / kpis.length)
    kpis.forEach((v, i) => { v.x = PAD + i * (w + PAD); v.y = y; v.width = w; v.height = h })
    y += h + PAD
  }

  // Bottom row — tables spanning full width
  const tableH = tables.length ? 220 : 0
  const tableY = pageHeight - tableH - PAD
  tables.forEach(v => { v.x = PAD; v.y = tableY; v.width = pageWidth - PAD * 2; v.height = tableH })

  // Middle — charts in 2-column grid
  const chartBottom = tables.length ? tableY - PAD : pageHeight - PAD
  const chartAreaH  = chartBottom - y
  const cols        = Math.min(charts.length, 2)
  if (cols) {
    const w = Math.floor((pageWidth - PAD * (cols + 1)) / cols)
    const rows = Math.ceil(charts.length / cols)
    const h = Math.max(100, Math.floor(chartAreaH / rows) - PAD)
    charts.forEach((v, i) => {
      v.x = PAD + (i % cols) * (w + PAD)
      v.y = y + Math.floor(i / cols) * (h + PAD)
      v.width = w
      v.height = h
    })
  }

  return items
}

// ── Key Accounts Assessment ───────────────────────────────────────────────────

const kaPages: MockPage[] = [
  {
    id: 'ka-p1',
    name: 'KA Requirement',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'ka-p1-v3', title: 'Account Filter', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'ka-p1-v4', title: 'Region Filter', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'ka-p1-v1', title: 'Total Requirement Volume', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '24,850', mockSubtitle: '+12% vs LY' },
      { id: 'ka-p1-v7', title: 'Req vs Forecast Gap', type: 'KPI Card', assessmentStatus: 'fail', mockValue: '-3.2%', mockSubtitle: 'Below target' },
      { id: 'ka-p1-v2', title: 'Requirement by Account', type: 'Bar Chart', assessmentStatus: 'pass', mockValue: 'Bar Chart', mockSubtitle: 'Top 10 Accounts' },
      { id: 'ka-p1-v5', title: 'Requirement Trend YTD', type: 'Line Chart', assessmentStatus: 'warning', mockValue: 'Line Chart', mockSubtitle: 'Jan–Dec' },
      { id: 'ka-p1-v6', title: 'Requirement Detail Table', type: 'Table', assessmentStatus: 'pass', mockValue: 'Table' },
    ]),
  },
  {
    id: 'ka-p2',
    name: 'Cluster Order Pattern',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'ka-p2-v4', title: 'Cluster Selector', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'ka-p2-v2', title: 'Cluster Revenue', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '£8.4M', mockSubtitle: '+7% MoM' },
      { id: 'ka-p2-v1', title: 'Orders by Cluster', type: 'Bar Chart', assessmentStatus: 'pass', mockValue: 'Bar Chart', mockSubtitle: 'All Clusters' },
      { id: 'ka-p2-v6', title: 'Order Volume Trend', type: 'Line Chart', assessmentStatus: 'in-progress', mockValue: 'Line Chart' },
      { id: 'ka-p2-v3', title: 'Order Frequency Matrix', type: 'Matrix', assessmentStatus: 'warning', mockValue: 'Matrix' },
      { id: 'ka-p2-v5', title: 'Top SKUs per Cluster', type: 'Table', assessmentStatus: 'pass', mockValue: 'Table' },
    ]),
  },
  {
    id: 'ka-p3',
    name: 'Trend Order Pattern',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'ka-p3-v4', title: 'Date Range Selector', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'ka-p3-v2', title: 'MoM Growth', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '+4.1%', mockSubtitle: 'Month on Month' },
      { id: 'ka-p3-v1', title: 'Order Trend 12M', type: 'Line Chart', assessmentStatus: 'pass', mockValue: 'Line Chart', mockSubtitle: 'Rolling 12 Months' },
      { id: 'ka-p3-v3', title: 'Seasonality Index', type: 'Bar Chart', assessmentStatus: 'warning', mockValue: 'Bar Chart' },
      { id: 'ka-p3-v6', title: 'Forecast Overlay', type: 'Line Chart', assessmentStatus: 'not-assessed', mockValue: 'Line Chart' },
      { id: 'ka-p3-v5', title: 'Trend by Product Group', type: 'Matrix', assessmentStatus: 'fail', mockValue: 'Matrix' },
      { id: 'ka-p3-v7', title: 'Outlier Flag Table', type: 'Table', assessmentStatus: 'pass', mockValue: 'Table' },
    ]),
  },
  {
    id: 'ka-p4',
    name: 'OTIF Analysis',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'ka-p4-v8', title: 'Account Selector', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'ka-p4-v1', title: 'OTIF %', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '94.7%', mockSubtitle: 'Target: 95%' },
      { id: 'ka-p4-v2', title: 'On-Time Delivery Rate', type: 'Card', assessmentStatus: 'pass', mockValue: '96.2%' },
      { id: 'ka-p4-v3', title: 'In-Full Rate', type: 'Card', assessmentStatus: 'warning', mockValue: '93.1%' },
      { id: 'ka-p4-v4', title: 'OTIF by Account', type: 'Bar Chart', assessmentStatus: 'pass', mockValue: 'Bar Chart' },
      { id: 'ka-p4-v5', title: 'Failure Reason Breakdown', type: 'Donut Chart', assessmentStatus: 'pass', mockValue: 'Donut Chart' },
      { id: 'ka-p4-v6', title: 'OTIF Trend', type: 'Line Chart', assessmentStatus: 'not-assessed', mockValue: 'Line Chart' },
      { id: 'ka-p4-v7', title: 'Delay Detail', type: 'Table', assessmentStatus: 'fail', mockValue: 'Table' },
    ]),
  },
  {
    id: 'ka-p5',
    name: 'Tyre Volume Overview',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'ka-p5-v4', title: 'Size Selector', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'ka-p5-v1', title: 'Total Tyre Volume', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '142,380 units', mockSubtitle: 'YTD' },
      { id: 'ka-p5-v6', title: 'Volume vs Target', type: 'KPI Card', assessmentStatus: 'fail', mockValue: '-2.8%', mockSubtitle: 'Below target' },
      { id: 'ka-p5-v2', title: 'Volume by Size', type: 'Bar Chart', assessmentStatus: 'pass', mockValue: 'Bar Chart' },
      { id: 'ka-p5-v5', title: 'Monthly Volume Trend', type: 'Line Chart', assessmentStatus: 'pass', mockValue: 'Line Chart' },
      { id: 'ka-p5-v3', title: 'Volume by Brand', type: 'Donut Chart', assessmentStatus: 'warning', mockValue: 'Donut Chart' },
    ]),
  },
  {
    id: 'ka-p6',
    name: 'Performance Scorecard',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'ka-p6-v5', title: 'Account Filter', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'ka-p6-v2', title: 'Overall Score', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '82/100', mockSubtitle: 'Grade: B' },
      { id: 'ka-p6-v3', title: 'Revenue Achievement', type: 'Card', assessmentStatus: 'pass', mockValue: '88%' },
      { id: 'ka-p6-v4', title: 'Volume Achievement', type: 'Card', assessmentStatus: 'warning', mockValue: '79%' },
      { id: 'ka-p6-v6', title: 'KPI Trend', type: 'Line Chart', assessmentStatus: 'pass', mockValue: 'Line Chart' },
      { id: 'ka-p6-v1', title: 'Scorecard Summary', type: 'Matrix', assessmentStatus: 'pass', mockValue: 'Matrix' },
      { id: 'ka-p6-v7', title: 'Scorecard Detail', type: 'Table', assessmentStatus: 'not-assessed', mockValue: 'Table' },
    ]),
  },
  {
    id: 'ka-p7',
    name: 'Exception Report',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'ka-p7-v4', title: 'Priority Filter', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'ka-p7-v1', title: 'Total Exceptions', type: 'KPI Card', assessmentStatus: 'fail', mockValue: '47', mockSubtitle: '+12 this week' },
      { id: 'ka-p7-v5', title: 'Resolution Rate', type: 'Card', assessmentStatus: 'warning', mockValue: '61%' },
      { id: 'ka-p7-v2', title: 'Exception by Type', type: 'Bar Chart', assessmentStatus: 'pass', mockValue: 'Bar Chart' },
      { id: 'ka-p7-v6', title: 'Exception Trend', type: 'Line Chart', assessmentStatus: 'not-assessed', mockValue: 'Line Chart' },
      { id: 'ka-p7-v3', title: 'Exception Detail Table', type: 'Table', assessmentStatus: 'pass', mockValue: 'Table' },
    ]),
  },
]

// ── Supply Chain Dashboard ─────────────────────────────────────────────────────

const scPages: MockPage[] = [
  {
    id: 'sc-p1',
    name: 'Overview',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'sc-p1-v7', title: 'Date Filter', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'sc-p1-v1', title: 'Supply Chain Health Score', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '87%', mockSubtitle: '+3pts MoM' },
      { id: 'sc-p1-v2', title: 'Total Orders', type: 'Card', assessmentStatus: 'pass', mockValue: '15,240' },
      { id: 'sc-p1-v3', title: 'Active Suppliers', type: 'Card', assessmentStatus: 'pass', mockValue: '238' },
      { id: 'sc-p1-v4', title: 'On-Time Delivery', type: 'Card', assessmentStatus: 'warning', mockValue: '91.4%' },
      { id: 'sc-p1-v5', title: 'Orders by Category', type: 'Bar Chart', assessmentStatus: 'pass', mockValue: 'Bar Chart' },
      { id: 'sc-p1-v6', title: 'Supply Flow Map', type: 'Matrix', assessmentStatus: 'not-assessed', mockValue: 'Matrix' },
    ]),
  },
  {
    id: 'sc-p2',
    name: 'Inventory Status',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'sc-p2-v6', title: 'Category Filter', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'sc-p2-v1', title: 'Total Inventory Value', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '£24.7M', mockSubtitle: 'Current Stock Value' },
      { id: 'sc-p2-v2', title: 'Days on Hand', type: 'Card', assessmentStatus: 'warning', mockValue: '42 days' },
      { id: 'sc-p2-v3', title: 'Stock by Warehouse', type: 'Bar Chart', assessmentStatus: 'pass', mockValue: 'Bar Chart' },
      { id: 'sc-p2-v5', title: 'Inventory Trend', type: 'Line Chart', assessmentStatus: 'pass', mockValue: 'Line Chart' },
      { id: 'sc-p2-v4', title: 'Low Stock Alerts', type: 'Table', assessmentStatus: 'fail', mockValue: 'Table' },
    ]),
  },
  {
    id: 'sc-p3',
    name: 'Supplier Performance',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'sc-p3-v5', title: 'Supplier Filter', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'sc-p3-v2', title: 'Top Supplier Rating', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '4.6 / 5', mockSubtitle: 'Avg Supplier Score' },
      { id: 'sc-p3-v3', title: 'Defect Rate by Supplier', type: 'Bar Chart', assessmentStatus: 'warning', mockValue: 'Bar Chart' },
      { id: 'sc-p3-v4', title: 'Lead Time Distribution', type: 'Donut Chart', assessmentStatus: 'pass', mockValue: 'Donut Chart' },
      { id: 'sc-p3-v6', title: 'Performance Trend', type: 'Line Chart', assessmentStatus: 'not-assessed', mockValue: 'Line Chart' },
      { id: 'sc-p3-v1', title: 'Supplier Scorecard', type: 'Matrix', assessmentStatus: 'pass', mockValue: 'Matrix' },
      { id: 'sc-p3-v7', title: 'Supplier Detail', type: 'Table', assessmentStatus: 'pass', mockValue: 'Table' },
    ]),
  },
  {
    id: 'sc-p4',
    name: 'Delivery Tracking',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'sc-p4-v7', title: 'Region Filter', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'sc-p4-v1', title: 'Deliveries Today', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '184', mockSubtitle: '12 delayed' },
      { id: 'sc-p4-v2', title: 'On-Time %', type: 'Card', assessmentStatus: 'pass', mockValue: '93.5%' },
      { id: 'sc-p4-v3', title: 'Delayed Orders', type: 'Card', assessmentStatus: 'fail', mockValue: '12' },
      { id: 'sc-p4-v4', title: 'Delivery by Region', type: 'Bar Chart', assessmentStatus: 'pass', mockValue: 'Bar Chart' },
      { id: 'sc-p4-v5', title: 'Delay Reason Breakdown', type: 'Donut Chart', assessmentStatus: 'warning', mockValue: 'Donut Chart' },
      { id: 'sc-p4-v8', title: 'Delivery Trend', type: 'Line Chart', assessmentStatus: 'pass', mockValue: 'Line Chart' },
      { id: 'sc-p4-v6', title: 'Delivery Log', type: 'Table', assessmentStatus: 'not-assessed', mockValue: 'Table' },
    ]),
  },
  {
    id: 'sc-p5',
    name: 'Cost Analysis',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'sc-p5-v1', title: 'Total Supply Chain Cost', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '£5.2M', mockSubtitle: 'YTD Spend' },
      { id: 'sc-p5-v2', title: 'Cost per Unit', type: 'Card', assessmentStatus: 'warning', mockValue: '£34.12' },
      { id: 'sc-p5-v3', title: 'Cost by Category', type: 'Bar Chart', assessmentStatus: 'pass', mockValue: 'Bar Chart' },
      { id: 'sc-p5-v4', title: 'Cost Trend', type: 'Line Chart', assessmentStatus: 'pass', mockValue: 'Line Chart' },
      { id: 'sc-p5-v5', title: 'Cost Breakdown', type: 'Donut Chart', assessmentStatus: 'not-assessed', mockValue: 'Donut Chart' },
      { id: 'sc-p5-v6', title: 'Cost Detail Table', type: 'Table', assessmentStatus: 'fail', mockValue: 'Table' },
    ]),
  },
]

// ── Financial Performance Report ──────────────────────────────────────────────

const fpPages: MockPage[] = [
  {
    id: 'fp-p1',
    name: 'Executive Summary',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'fp-p1-v6', title: 'Period Selector', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'fp-p1-v1', title: 'Total Revenue', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '£48.3M', mockSubtitle: '+11% vs PY' },
      { id: 'fp-p1-v2', title: 'Net Profit', type: 'Card', assessmentStatus: 'pass', mockValue: '£9.6M' },
      { id: 'fp-p1-v3', title: 'EBITDA Margin', type: 'Card', assessmentStatus: 'pass', mockValue: '22.4%' },
      { id: 'fp-p1-v4', title: 'Revenue vs Budget', type: 'Bar Chart', assessmentStatus: 'warning', mockValue: 'Bar Chart' },
      { id: 'fp-p1-v5', title: 'Profit Trend', type: 'Line Chart', assessmentStatus: 'pass', mockValue: 'Line Chart' },
      { id: 'fp-p1-v7', title: 'KPI Summary Table', type: 'Table', assessmentStatus: 'pass', mockValue: 'Table' },
    ]),
  },
  {
    id: 'fp-p2',
    name: 'Revenue Analysis',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'fp-p2-v5', title: 'BU Filter', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'fp-p2-v2', title: 'Total Revenue', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '£48.3M', mockSubtitle: 'YTD' },
      { id: 'fp-p2-v7', title: 'YoY Growth', type: 'Card', assessmentStatus: 'pass', mockValue: '+11.2%' },
      { id: 'fp-p2-v1', title: 'Revenue by Business Unit', type: 'Bar Chart', assessmentStatus: 'pass', mockValue: 'Bar Chart' },
      { id: 'fp-p2-v3', title: 'Revenue Mix', type: 'Donut Chart', assessmentStatus: 'pass', mockValue: 'Donut Chart' },
      { id: 'fp-p2-v4', title: 'Monthly Revenue', type: 'Line Chart', assessmentStatus: 'warning', mockValue: 'Line Chart' },
      { id: 'fp-p2-v6', title: 'Revenue Detail', type: 'Table', assessmentStatus: 'fail', mockValue: 'Table' },
    ]),
  },
  {
    id: 'fp-p3',
    name: 'Cost Breakdown',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'fp-p3-v6', title: 'Category Filter', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'fp-p3-v1', title: 'Total Operating Cost', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '£38.7M', mockSubtitle: '-2% vs budget' },
      { id: 'fp-p3-v2', title: 'Cost by Category', type: 'Bar Chart', assessmentStatus: 'pass', mockValue: 'Bar Chart' },
      { id: 'fp-p3-v3', title: 'Cost Structure', type: 'Donut Chart', assessmentStatus: 'pass', mockValue: 'Donut Chart' },
      { id: 'fp-p3-v4', title: 'Cost Trend', type: 'Line Chart', assessmentStatus: 'not-assessed', mockValue: 'Line Chart' },
      { id: 'fp-p3-v5', title: 'Cost Detail Matrix', type: 'Matrix', assessmentStatus: 'warning', mockValue: 'Matrix' },
    ]),
  },
  {
    id: 'fp-p4',
    name: 'Margin Analysis',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'fp-p4-v6', title: 'Product Filter', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'fp-p4-v1', title: 'Gross Margin %', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '38.2%', mockSubtitle: 'Target: 37%' },
      { id: 'fp-p4-v2', title: 'Net Margin %', type: 'Card', assessmentStatus: 'pass', mockValue: '19.8%' },
      { id: 'fp-p4-v3', title: 'Margin by Product', type: 'Bar Chart', assessmentStatus: 'warning', mockValue: 'Bar Chart' },
      { id: 'fp-p4-v4', title: 'Margin Trend', type: 'Line Chart', assessmentStatus: 'pass', mockValue: 'Line Chart' },
      { id: 'fp-p4-v5', title: 'Margin Bridge', type: 'Bar Chart', assessmentStatus: 'fail', mockValue: 'Bar Chart' },
      { id: 'fp-p4-v7', title: 'Margin Detail', type: 'Table', assessmentStatus: 'not-assessed', mockValue: 'Table' },
    ]),
  },
  {
    id: 'fp-p5',
    name: 'Budget vs Actual',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'fp-p5-v7', title: 'Period Selector', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'fp-p5-v1', title: 'Budget Variance', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '-£420K', mockSubtitle: '-0.9% vs budget' },
      { id: 'fp-p5-v2', title: 'Revenue Variance', type: 'Card', assessmentStatus: 'pass', mockValue: '+£1.2M' },
      { id: 'fp-p5-v3', title: 'Cost Variance', type: 'Card', assessmentStatus: 'warning', mockValue: '+£840K' },
      { id: 'fp-p5-v4', title: 'Budget vs Actual by BU', type: 'Bar Chart', assessmentStatus: 'pass', mockValue: 'Bar Chart' },
      { id: 'fp-p5-v5', title: 'Variance Trend', type: 'Line Chart', assessmentStatus: 'not-assessed', mockValue: 'Line Chart' },
      { id: 'fp-p5-v6', title: 'Variance Detail', type: 'Table', assessmentStatus: 'fail', mockValue: 'Table' },
    ]),
  },
  {
    id: 'fp-p6',
    name: 'Forecast',
    page_width: 1280,
    page_height: 720,
    visuals: layoutPage([
      { id: 'fp-p6-v5', title: 'Scenario Selector', type: 'Slicer', assessmentStatus: 'not-assessed', mockValue: 'Slicer' },
      { id: 'fp-p6-v1', title: 'FY Forecast Revenue', type: 'KPI Card', assessmentStatus: 'pass', mockValue: '£52.1M', mockSubtitle: 'FY Projection' },
      { id: 'fp-p6-v4', title: 'Confidence Interval', type: 'Card', assessmentStatus: 'not-assessed', mockValue: '±4.2%' },
      { id: 'fp-p6-v2', title: 'Forecast vs Actual', type: 'Line Chart', assessmentStatus: 'pass', mockValue: 'Line Chart' },
      { id: 'fp-p6-v3', title: 'Forecast by BU', type: 'Bar Chart', assessmentStatus: 'warning', mockValue: 'Bar Chart' },
      { id: 'fp-p6-v6', title: 'Forecast Detail Table', type: 'Table', assessmentStatus: 'pass', mockValue: 'Table' },
    ]),
  },
]

// ── Exported mock data ─────────────────────────────────────────────────────────

export const mockReports: MockReport[] = [
  {
    id: 'mock-report-1',
    name: 'Key Accounts Assessment',
    lastRefreshed: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    pageCount: 7,
    assessmentStatus: 'in-progress',
    workspaceName: 'Sales Analytics',
    pages: kaPages,
  },
  {
    id: 'mock-report-2',
    name: 'Supply Chain Dashboard',
    lastRefreshed: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    pageCount: 5,
    assessmentStatus: 'warning',
    workspaceName: 'Operations Hub',
    pages: scPages,
  },
  {
    id: 'mock-report-3',
    name: 'Financial Performance Report',
    lastRefreshed: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    pageCount: 6,
    assessmentStatus: 'pass',
    workspaceName: 'Finance Workspace',
    pages: fpPages,
  },
]
