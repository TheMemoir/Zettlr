<template>
  <div
    v-bind:class="{
      'editor-pane': true,
      'distraction-free': distractionFree
    }"
    v-bind:style="elementStyles"
  >
    <!-- We have a leaf: Default DocumentTabs/Editor combo -->
    <DocumentTabs
      v-bind:leaf-id="leafId"
      v-bind:window-id="windowId"
    ></DocumentTabs>
    <template v-for="file in openFiles" v-bind:key="file.path">
      <MainEditor
        v-show="activeFile?.path === file.path"
        v-bind:file="file"
        v-bind:distraction-free="distractionFree"
        v-bind:leaf-id="leafId"
        v-bind:active-file="activeFile"
        v-bind:window-id="windowId"
        v-bind:editor-commands="editorCommands"
        v-on:global-search="$emit('globalSearch', $event)"
      ></MainEditor>
    </template>
    <div v-if="hasNoOpenFiles" class="empty-pane"></div>
  </div>
</template>

<script lang="ts">
import { LeafNodeJSON, OpenDocument } from '@dts/common/documents'
import { EditorCommands } from '@dts/renderer/editor'
import { defineComponent } from 'vue'
import DocumentTabs from './DocumentTabs.vue'
import MainEditor from './MainEditor.vue'

export default defineComponent({
  name: 'EditorPane',
  components: {
    DocumentTabs,
    MainEditor
  },
  props: {
    leafId: {
      type: String,
      required: true
    },
    windowId: {
      type: String,
      required: true
    },
    availableWidth: {
      type: Number,
      default: 100
    },
    availableHeight: {
      type: Number,
      default: 100
    },
    editorCommands: {
      type: Object as () => EditorCommands,
      required: true
    }
  },
  emits: ['globalSearch'],
  computed: {
    elementStyles () {
      if (this.distractionFree) {
        return ''
      } else {
        return `width: ${this.availableWidth}%; height: ${this.availableHeight}%`
      }
    },
    lastLeafId () {
      return this.$store.state.lastLeafId
    },
    distractionFree () {
      return this.$store.state.distractionFreeMode === this.leafId
    },
    node (): LeafNodeJSON|undefined {
      return this.$store.state.paneData.find((leaf: LeafNodeJSON) => leaf.id === this.leafId)
    },
    activeFile (): OpenDocument|null {
      return this.node?.activeFile ?? null
    },
    openFiles (): OpenDocument[] {
      return this.node?.openFiles ?? []
    },
    hasNoOpenFiles (): boolean {
      return this.openFiles.length === 0
    }
  }
})
</script>

<style lang="less">
body {
  .split-pane-container {
    .editor-pane {
      // Styles for the editor pane
      flex-grow: 1;
    }
  }

  .editor-pane .empty-pane {
    position: absolute;
    top: 30px; // Space for the document tabbar
    bottom: 0;
    left: 0;
    right: 0;
    // If the editor is empty, display a nice background image
    background-position: center center;
    background-size: contain;
    background-repeat: no-repeat;
    background-color: inherit;
    background-image: url(../common/img/logo.svg);
    padding-top: 5em;
  }
}
</style>
