<template>
  <div class="reservation-list">
    <h2 class="page-title">预约管理</h2>

    <!-- 统计卡片 -->
    <a-row :gutter="[16, 16]" class="stat-row">
      <a-col :xs="12" :sm="12" :md="6">
        <div class="stat-card-rich waiting">
          <div class="stat-card-header">
            <div class="stat-card-icon">
              <OrderedListOutlined />
            </div>
            <div class="stat-card-badge">
              <ClockCircleOutlined />
            </div>
          </div>
          <div class="stat-card-body">
            <div class="stat-card-value">{{ reservationStore.waitingCount }}</div>
            <div class="stat-card-label">候补中</div>
          </div>
          <div class="stat-card-footer">
            <span>按候补顺序等待库存释放</span>
          </div>
        </div>
      </a-col>
      <a-col :xs="12" :sm="12" :md="6">
        <div class="stat-card-rich notified">
          <div class="stat-card-header">
            <div class="stat-card-icon">
              <BellOutlined />
            </div>
            <div class="stat-card-badge warning" v-if="reservationStore.notifiedCount > 0">
              <SoundOutlined />
            </div>
          </div>
          <div class="stat-card-body">
            <div class="stat-card-value">{{ reservationStore.notifiedCount }}</div>
            <div class="stat-card-label">待到馆</div>
          </div>
          <div class="stat-card-footer">
            <span>已通知，保留 {{ PICKUP_DAYS }} 天到馆期限</span>
          </div>
        </div>
      </a-col>
      <a-col :xs="12" :sm="12" :md="6">
        <div class="stat-card-rich fulfilled">
          <div class="stat-card-header">
            <div class="stat-card-icon">
              <CheckCircleOutlined />
            </div>
            <div class="stat-card-badge success">
              <SmileOutlined />
            </div>
          </div>
          <div class="stat-card-body">
            <div class="stat-card-value">{{ reservationStore.todayFulfilledCount }}</div>
            <div class="stat-card-label">今日到馆</div>
          </div>
          <div class="stat-card-footer">
            <span>到馆确认后自动转为借阅</span>
          </div>
        </div>
      </a-col>
      <a-col :xs="12" :sm="12" :md="6">
        <div
          :class="['stat-card-rich', 'failed', { 'clickable': reservationStore.failedNotificationCount > 0 }]"
          @click="reservationStore.failedNotificationCount > 0 && (activeTab = 'notifications')"
        >
          <div class="stat-card-header">
            <div class="stat-card-icon">
              <ExclamationCircleOutlined />
            </div>
            <div class="stat-card-badge warning" v-if="reservationStore.failedNotificationCount > 0">
              <WarningOutlined />
            </div>
          </div>
          <div class="stat-card-body">
            <div class="stat-card-value">{{ reservationStore.failedNotificationCount }}</div>
            <div class="stat-card-label">通知发送失败</div>
          </div>
          <div class="stat-card-footer">
            <span v-if="reservationStore.failedNotificationCount > 0" class="warning-text">
              <AlertOutlined /> 点击查看并重试
            </span>
            <span v-else class="success-text">
              <CheckOutlined /> 通知通道正常
            </span>
          </div>
        </div>
      </a-col>
    </a-row>

    <!-- 搜索与操作区域 -->
    <div class="search-area animate-slide-down">
      <a-row :gutter="16" align="middle">
        <a-col :xs="24" :sm="12" :md="8" :lg="6">
          <a-input
            v-model:value="searchKeyword"
            placeholder="搜索读者、图书、卡号"
            allow-clear
            class="search-input"
          >
            <template #suffix>
              <SearchOutlined class="search-icon" />
            </template>
          </a-input>
        </a-col>
        <a-col :xs="24" :sm="12" :md="8" :lg="5">
          <a-select
            v-model:value="selectedStatus"
            placeholder="选择状态"
            allow-clear
            style="width: 100%"
          >
            <a-select-option value="waiting">候补中</a-select-option>
            <a-select-option value="notified">待到馆</a-select-option>
            <a-select-option value="fulfilled">已到馆</a-select-option>
            <a-select-option value="expired">已过期</a-select-option>
            <a-select-option value="cancelled">已取消</a-select-option>
          </a-select>
        </a-col>
        <a-col :xs="24" :sm="24" :md="8" :lg="13" class="action-col">
          <div class="channel-switch">
            <span class="channel-label">通知通道</span>
            <a-switch
              :checked="!reservationStore.channelDown"
              checked-children="正常"
              un-checked-children="中断"
              @change="handleChannelChange"
            />
            <a-tooltip title="模拟通知发送中断：中断后新生成的到馆通知将发送失败，可在「通知记录」中重试">
              <QuestionCircleOutlined class="channel-help" />
            </a-tooltip>
          </div>
          <a-button type="primary" @click="showReserveModal()" class="add-btn">
            <PlusOutlined /> 新增预约
          </a-button>
        </a-col>
      </a-row>

      <transition name="fade-slide">
        <div v-if="hasFilters" class="search-result-tip">
          <span class="result-count">
            找到 <strong>{{ filteredReservations.length }}</strong> 条结果
          </span>
          <a-button type="link" size="small" @click="clearFilters" class="clear-btn">
            清除筛选
          </a-button>
        </div>
      </transition>
    </div>

    <!-- 数据区域 -->
    <div class="table-container animate-fade-in">
      <a-tabs v-model:activeKey="activeTab">
        <a-tab-pane key="reservations">
          <template #tab>
            <span>
              <OrderedListOutlined /> 预约队列
              <a-badge
                :count="reservationStore.waitingCount + reservationStore.notifiedCount"
                :number-style="{ backgroundColor: '#1890ff' }"
                :offset="[8, -2]"
              />
            </span>
          </template>

          <a-table
            :columns="reservationColumns"
            :data-source="filteredReservations"
            row-key="id"
            :pagination="{ pageSize: 10, showTotal: total => `共 ${total} 条` }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'reader'">
                <div class="text-primary">{{ record.readerName }}</div>
                <div class="text-secondary">{{ record.cardNo }}</div>
              </template>
              <template v-else-if="column.key === 'book'">
                <div class="text-primary">{{ record.bookTitle }}</div>
                <div class="text-secondary">{{ record.isbn }}</div>
              </template>
              <template v-else-if="column.key === 'queue'">
                <template v-if="record.status === 'waiting'">
                  <a-tag color="processing" class="queue-tag">
                    第 {{ reservationStore.getQueuePosition(record) }} 位
                  </a-tag>
                  <div class="text-secondary">
                    共 {{ reservationStore.getQueueByBook(record.bookId).length }} 人候补
                  </div>
                </template>
                <a-tag v-else-if="record.status === 'notified'" color="warning" class="queue-tag">
                  已轮到
                </a-tag>
                <span v-else class="text-secondary">-</span>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="getStatusColor(record.status)">
                  {{ getStatusText(record.status) }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'expireDate'">
                <template v-if="record.status === 'notified' && record.expireDate">
                  <span :class="{ 'expire-soon': isExpireSoon(record.expireDate) }">
                    {{ record.expireDate }}
                  </span>
                  <div v-if="isExpireSoon(record.expireDate)" class="expire-hint">即将过期</div>
                </template>
                <span v-else class="text-secondary">-</span>
              </template>
              <template v-else-if="column.key === 'notification'">
                <template v-if="latestNotificationOf(record)">
                  <a-tag :color="getNotificationColor(latestNotificationOf(record).status)">
                    {{ getNotificationText(latestNotificationOf(record).status) }}
                  </a-tag>
                </template>
                <span v-else class="text-secondary">-</span>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space wrap>
                  <a-button
                    v-if="record.status === 'notified'"
                    type="link"
                    size="small"
                    class="table-action-btn"
                    @click="handleConfirmArrival(record)"
                  >
                    <CheckOutlined /> 到馆确认
                  </a-button>
                  <a-button
                    v-if="record.status === 'notified' && latestNotificationOf(record)?.status === 'failed'"
                    type="link"
                    size="small"
                    class="table-action-btn retry-btn"
                    @click="handleRetryByReservation(record)"
                  >
                    <ReloadOutlined /> 重发通知
                  </a-button>
                  <a-button
                    v-if="record.status === 'waiting' || record.status === 'notified'"
                    type="link"
                    size="small"
                    danger
                    class="table-action-btn"
                    @click="handleCancel(record)"
                  >
                    <CloseOutlined /> 取消
                  </a-button>
                  <a-button
                    v-if="record.status === 'expired' || record.status === 'cancelled'"
                    type="link"
                    size="small"
                    class="table-action-btn retry-btn"
                    @click="handleReReserve(record)"
                  >
                    <RedoOutlined /> 重新预约
                  </a-button>
                  <span v-if="record.status === 'fulfilled'" class="completed-text">
                    <CheckCircleOutlined /> 已转借阅
                  </span>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-tab-pane>

        <a-tab-pane key="notifications">
          <template #tab>
            <span>
              <BellOutlined /> 通知记录
              <a-badge
                :count="reservationStore.failedNotificationCount"
                :number-style="{ backgroundColor: '#ff4d4f' }"
                :offset="[8, -2]"
              />
            </span>
          </template>

          <a-table
            :columns="notificationColumns"
            :data-source="sortedNotifications"
            row-key="id"
            :pagination="{ pageSize: 10, showTotal: total => `共 ${total} 条` }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'reservationId'">
                <a @click="locateReservation(record.reservationId)">#{{ record.reservationId }}</a>
              </template>
              <template v-else-if="column.key === 'reader'">
                <div class="text-primary">{{ record.readerName }}</div>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="getNotificationColor(record.status)">
                  {{ getNotificationText(record.status) }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'lastError'">
                <span v-if="record.lastError" class="error-text">{{ record.lastError }}</span>
                <span v-else class="text-secondary">-</span>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-button
                  v-if="record.status === 'failed'"
                  type="link"
                  size="small"
                  class="table-action-btn retry-btn"
                  :disabled="record.retryCount >= MAX_RETRY"
                  @click="handleRetryNotification(record)"
                >
                  <ReloadOutlined /> 重试
                </a-button>
                <span v-else-if="record.status === 'sent'" class="completed-text">
                  <CheckCircleOutlined /> 已送达
                </span>
                <span v-else class="text-secondary">
                  <LoadingOutlined /> 发送中
                </span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </div>

    <!-- 新增预约弹窗 -->
    <a-modal
      v-model:open="reserveModalVisible"
      title="新增预约"
      :confirm-loading="submitLoading"
      @ok="handleReserveSubmit"
      @cancel="handleModalClose"
      width="520px"
    >
      <a-alert
        type="info"
        show-icon
        message="仅可对无库存的馆藏条目登记预约；库存释放后将按候补顺序生成到馆通知。"
        class="reserve-tip"
      />
      <a-form
        ref="reserveFormRef"
        :model="reserveForm"
        :rules="reserveRules"
        :label-col="{ span: 5 }"
        :wrapper-col="{ span: 18 }"
      >
        <a-form-item label="读者" name="readerId">
          <a-select
            v-model:value="reserveForm.readerId"
            placeholder="请选择读者"
            show-search
            :filter-option="filterReader"
          >
            <a-select-option
              v-for="reader in availableReaders"
              :key="reader.id"
              :value="reader.id"
              :label="reader.name"
            >
              {{ reader.name }} ({{ reader.cardNo }})
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="图书" name="bookId">
          <a-select
            v-model:value="reserveForm.bookId"
            placeholder="请选择图书（仅无库存可预约）"
            show-search
            :filter-option="filterBook"
            @change="handleBookChange"
          >
            <a-select-option
              v-for="book in reservableBooks"
              :key="book.id"
              :value="book.id"
              :label="book.title"
            >
              {{ book.title }} (候补 {{ reservationStore.getQueueByBook(book.id).length }} 人)
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="selectedBookQueueInfo" label=" " :colon="false">
          <a-alert
            :type="selectedBookQueueInfo.count > 0 ? 'warning' : 'success'"
            show-icon
            :message="selectedBookQueueInfo.message"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  PlusOutlined,
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
  RedoOutlined,
  SearchOutlined,
  OrderedListOutlined,
  BellOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  SoundOutlined,
  SmileOutlined,
  WarningOutlined,
  AlertOutlined,
  QuestionCircleOutlined,
  LoadingOutlined
} from '@ant-design/icons-vue'
import { useReservationStore, PICKUP_DAYS, MAX_RETRY } from '@/stores/reservation'
import { useReaderStore } from '@/stores/reader'
import { useBookStore } from '@/stores/book'

const reservationStore = useReservationStore()
const readerStore = useReaderStore()
const bookStore = useBookStore()

const searchKeyword = ref('')
const selectedStatus = ref(null)
const activeTab = ref('reservations')
const reserveModalVisible = ref(false)
const submitLoading = ref(false)
const reserveFormRef = ref(null)

const reservationColumns = [
  { title: '单号', dataIndex: 'id', key: 'id', width: 70 },
  { title: '读者信息', key: 'reader', width: 130 },
  { title: '图书信息', key: 'book', width: 200 },
  { title: '队列位置', key: 'queue', width: 110 },
  { title: '状态', key: 'status', width: 90 },
  { title: '预约时间', dataIndex: 'createdAt', key: 'createdAt', width: 150,
    customRender: ({ text }) => formatDateTime(text) },
  { title: '到馆截止', key: 'expireDate', width: 110 },
  { title: '到馆通知', key: 'notification', width: 100 },
  { title: '操作', key: 'action', width: 220, fixed: 'right' }
]

const notificationColumns = [
  { title: '通知号', dataIndex: 'id', key: 'id', width: 80 },
  { title: '预约单号', key: 'reservationId', width: 90 },
  { title: '读者', key: 'reader', width: 100 },
  { title: '图书', dataIndex: 'bookTitle', key: 'bookTitle', width: 180 },
  { title: '状态', key: 'status', width: 90 },
  { title: '重试次数', dataIndex: 'retryCount', key: 'retryCount', width: 90 },
  { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 150,
    customRender: ({ text }) => formatDateTime(text) },
  { title: '发送时间', dataIndex: 'sentAt', key: 'sentAt', width: 150,
    customRender: ({ text }) => formatDateTime(text) },
  { title: '失败原因', key: 'lastError', width: 200 },
  { title: '操作', key: 'action', width: 100, fixed: 'right' }
]

const reserveForm = reactive({
  readerId: null,
  bookId: null
})

const reserveRules = {
  readerId: [{ required: true, message: '请选择读者' }],
  bookId: [{ required: true, message: '请选择图书' }]
}

const hasFilters = computed(() => searchKeyword.value || selectedStatus.value)

const filteredReservations = computed(() => {
  let result = [...reservationStore.reservations].sort((a, b) => b.id - a.id)

  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(r =>
      r.readerName.toLowerCase().includes(keyword) ||
      r.bookTitle.toLowerCase().includes(keyword) ||
      r.cardNo.toLowerCase().includes(keyword)
    )
  }

  if (selectedStatus.value) {
    result = result.filter(r => r.status === selectedStatus.value)
  }

  return result
})

const sortedNotifications = computed(() =>
  [...reservationStore.notifications].sort((a, b) => b.id - a.id)
)

const availableReaders = computed(() =>
  readerStore.readers.filter(r => r.status === 'active')
)

// 仅无库存的馆藏条目可登记预约
const reservableBooks = computed(() =>
  bookStore.books.filter(b => b.available === 0)
)

const selectedBookQueueInfo = computed(() => {
  if (!reserveForm.bookId) return null
  const count = reservationStore.getQueueByBook(reserveForm.bookId).length
  return {
    count,
    message: count > 0
      ? `该书当前有 ${count} 人候补，登记后将排在第 ${count + 1} 位`
      : '该书当前无人候补，登记后将排在第 1 位'
  }
})

onMounted(() => {
  // 进入页面时校正一次：处理过期预约、修复库存与队列的错位状态
  const { expiredCount, notifiedNext } = reservationStore.reconcile()
  if (expiredCount > 0) {
    message.warning(`已自动处理 ${expiredCount} 条过期预约，库存已顺延`)
  }
  if (notifiedNext > 0) {
    message.info(`库存已释放，为 ${notifiedNext} 位候补读者生成了到馆通知`)
  }
})

function formatDateTime(iso) {
  if (!iso) return '-'
  return iso.replace('T', ' ').slice(0, 16)
}

function latestNotificationOf(reservation) {
  return reservationStore.getLatestNotification(reservation.id)
}

function isExpireSoon(expireDate) {
  const today = new Date().toISOString().split('T')[0]
  return expireDate <= today
}

function getStatusColor(status) {
  const colors = {
    waiting: 'processing',
    notified: 'warning',
    fulfilled: 'success',
    expired: 'error',
    cancelled: 'default'
  }
  return colors[status] || 'default'
}

function getStatusText(status) {
  const texts = {
    waiting: '候补中',
    notified: '待到馆',
    fulfilled: '已到馆',
    expired: '已过期',
    cancelled: '已取消'
  }
  return texts[status] || status
}

function getNotificationColor(status) {
  const colors = {
    sending: 'processing',
    sent: 'success',
    failed: 'error'
  }
  return colors[status] || 'default'
}

function getNotificationText(status) {
  const texts = {
    sending: '发送中',
    sent: '已发送',
    failed: '发送失败'
  }
  return texts[status] || status
}

function filterReader(input, option) {
  return option.label.toLowerCase().includes(input.toLowerCase())
}

function filterBook(input, option) {
  return option.label.toLowerCase().includes(input.toLowerCase())
}

function handleChannelChange(checked) {
  reservationStore.setChannelDown(!checked)
  if (checked) {
    message.success('通知通道已恢复正常')
  } else {
    message.warning('通知通道已切换为中断（模拟），新的到馆通知将发送失败')
  }
}

function clearFilters() {
  searchKeyword.value = ''
  selectedStatus.value = null
}

function handleBookChange() {
  // 切换图书时仅刷新候补提示，无需额外处理
}

function handleModalClose() {
  nextTick(() => {
    reserveFormRef.value?.resetFields()
  })
}

function showReserveModal(preset = null) {
  reserveForm.readerId = preset?.readerId ?? null
  reserveForm.bookId = preset?.bookId ?? null
  reserveModalVisible.value = true
  nextTick(() => {
    reserveFormRef.value?.clearValidate()
  })
}

async function handleReserveSubmit() {
  try {
    await reserveFormRef.value.validate()
    submitLoading.value = true

    await new Promise(resolve => setTimeout(resolve, 300))

    const result = reservationStore.addReservation({
      readerId: reserveForm.readerId,
      bookId: reserveForm.bookId
    })

    if (result.ok) {
      const position = reservationStore.getQueuePosition(result.reservation)
      if (result.reservation.status === 'notified') {
        message.success('预约登记成功，库存已释放，该预约已直接生成到馆通知')
      } else {
        message.success(`预约登记成功，当前排在第 ${position} 位`)
      }
      reserveModalVisible.value = false
    } else if (result.duplicate) {
      message.warning(result.error)
    } else {
      message.error(result.error)
    }
  } catch (error) {
    console.error('表单验证失败:', error)
  } finally {
    submitLoading.value = false
  }
}

function handleConfirmArrival(record) {
  Modal.confirm({
    title: '到馆确认',
    content: `确认读者「${record.readerName}」已到馆取书？确认后将自动生成借阅记录。`,
    okText: '确认到馆',
    cancelText: '取消',
    onOk() {
      const result = reservationStore.confirmArrival(record.id)
      if (result.ok) {
        if (result.duplicated) {
          message.info('该预约已确认过，无需重复操作')
        } else {
          message.success('到馆确认成功，已转为借阅记录')
        }
      } else {
        message.error(result.error)
      }
    }
  })
}

function handleCancel(record) {
  const isNotified = record.status === 'notified'
  Modal.confirm({
    title: '取消预约',
    content: isNotified
      ? `该预约已生成到馆通知，取消后库存将顺延给下一位候补读者。确定取消「${record.bookTitle}」的预约吗？`
      : `确定取消「${record.bookTitle}」的预约吗？`,
    okText: '确定取消',
    okType: 'danger',
    cancelText: '再想想',
    onOk() {
      const result = reservationStore.cancelReservation(record.id)
      if (result.ok) {
        message.success('预约已取消')
        if (result.notifiedNext > 0) {
          message.info('库存已顺延，为下一位候补读者生成了到馆通知')
        }
      } else {
        message.error(result.error)
      }
    }
  })
}

function handleReReserve(record) {
  const book = bookStore.getBookById(record.bookId)
  if (!book) {
    message.error('该馆藏条目已不存在，无法重新预约')
    return
  }
  if (book.available > 0) {
    message.info('该图书当前已有库存，可直接办理借阅，无需预约')
    return
  }
  showReserveModal({ readerId: record.readerId, bookId: record.bookId })
}

function handleRetryByReservation(record) {
  const notification = reservationStore.getLatestNotification(record.id)
  if (!notification) {
    message.error('未找到该预约的通知记录')
    return
  }
  handleRetryNotification(notification)
}

function handleRetryNotification(notification) {
  const result = reservationStore.retryNotification(notification.id)
  if (result.ok) {
    message.info('正在重新发送通知…')
  } else {
    message.error(result.error)
  }
}

function locateReservation(reservationId) {
  const reservation = reservationStore.getReservationById(reservationId)
  if (!reservation) {
    message.warning('对应的预约记录不存在')
    return
  }
  activeTab.value = 'reservations'
  searchKeyword.value = reservation.readerName
  selectedStatus.value = null
}
</script>

<style lang="less" scoped>
.reservation-list {
  .page-title {
    font-size: 20px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 24px;
  }
}

.stat-row {
  margin-bottom: 16px;
}

.stat-card-rich {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
  border-left: 4px solid transparent;
  height: 100%;

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    background: #f0f7ff;
  }

  &.clickable {
    cursor: pointer;
  }

  &.waiting {
    border-left-color: #1890ff;
    .stat-card-icon { background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%); }
    .stat-card-value { color: #1890ff; }
  }

  &.notified {
    border-left-color: #faad14;
    .stat-card-icon { background: linear-gradient(135deg, #faad14 0%, #ffc53d 100%); }
    .stat-card-value { color: #faad14; }
  }

  &.fulfilled {
    border-left-color: #52c41a;
    .stat-card-icon { background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%); }
    .stat-card-value { color: #52c41a; }
  }

  &.failed {
    border-left-color: #ff4d4f;
    .stat-card-icon { background: linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%); }
    .stat-card-value { color: #ff4d4f; }
  }

  .stat-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

    .stat-card-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: #fff;
    }

    .stat-card-badge {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      background: #e6f7ff;
      color: #1890ff;

      &.success {
        background: #f6ffed;
        color: #52c41a;
      }

      &.warning {
        background: #fff2e8;
        color: #fa541c;
        animation: pulse 1.5s infinite;
      }
    }
  }

  .stat-card-body {
    margin-bottom: 12px;

    .stat-card-value {
      font-size: 32px;
      font-weight: 700;
      line-height: 1.2;
    }

    .stat-card-label {
      font-size: 14px;
      color: #999;
      margin-top: 4px;
    }
  }

  .stat-card-footer {
    font-size: 12px;
    color: #999;
    padding-top: 12px;
    border-top: 1px dashed #f0f0f0;

    .warning-text {
      color: #fa541c;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .success-text {
      color: #52c41a;
      display: flex;
      align-items: center;
      gap: 4px;
    }
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fadeIn 0.5s ease-out both;
}

.animate-slide-down {
  animation: slideDown 0.5s ease-out both;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.search-area {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 20px;
  margin-bottom: 16px;
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }

  .search-input {
    transition: all 0.3s ease;
  }

  .search-icon {
    color: rgba(0, 0, 0, 0.45);
  }

  .action-col {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .channel-switch {
    display: flex;
    align-items: center;
    gap: 8px;

    .channel-label {
      font-size: 13px;
      color: #666;
    }

    .channel-help {
      color: #999;
      cursor: help;
    }
  }

  .add-btn {
    transition: all 0.3s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(24, 144, 255, 0.4);
    }
  }

  .search-result-tip {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px dashed #f0f0f0;
    display: flex;
    align-items: center;
    justify-content: space-between;

    .result-count {
      color: #666;
      font-size: 13px;

      strong {
        color: #faad14;
        font-size: 16px;
        margin: 0 4px;
      }
    }
  }
}

.table-container {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 20px;
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }

  .table-action-btn {
    padding: 2px 4px;
    height: auto;
    border-radius: 4px;
    transition: all 0.2s ease;

    &.retry-btn:hover {
      color: #1890ff;
      background: #e6f7ff;
    }
  }

  .completed-text {
    color: #52c41a;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .queue-tag {
    margin-bottom: 2px;
  }

  .expire-soon {
    color: #ff4d4f;
    font-weight: 500;
  }

  .expire-hint {
    font-size: 12px;
    color: #ff4d4f;
  }

  .error-text {
    color: #ff4d4f;
    font-size: 12px;
  }
}

.text-primary {
  font-weight: 500;
  color: #1a1a1a;
}

.text-secondary {
  font-size: 12px;
  color: #999;
}

.reserve-tip {
  margin-bottom: 16px;
}
</style>
