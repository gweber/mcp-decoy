<template>
  <div class="stats-card">
    <div class="card-header">
      <span class="card-title">{{ title }}</span>
      <span class="card-accent" :style="{ background: `var(${color})` }"></span>
    </div>
    <div class="card-value" :style="{ color: `var(${color})` }">
      {{ formattedValue }}
    </div>
    <div v-if="sub" class="card-sub">{{ sub }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  value: { type: [Number, String], default: 0 },
  sub: { type: String, default: '' },
  color: { type: String, default: '--primary' },
})

const formattedValue = computed(() => {
  if (typeof props.value === 'number') {
    return props.value.toLocaleString()
  }
  return props.value ?? '—'
})
</script>

<style scoped>
.stats-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  overflow: hidden;
  transition: border-color 0.2s;
}

.stats-card:hover {
  border-color: var(--muted);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.card-accent {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  opacity: 0.8;
}

.card-value {
  font-size: 36px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
}

.card-sub {
  font-size: 12px;
  color: var(--muted);
}
</style>
