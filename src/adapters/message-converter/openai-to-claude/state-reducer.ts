import type { ConversionState, ConversionAction } from "./types";

// State reducer
export function conversionReducer(state: ConversionState, action: ConversionAction): ConversionState {
  switch (action.type) {
    case 'ADD_TEXT_BLOCK': {
      const newState = { ...state };
      newState.contentBlocks.set(action.id, {
        index: state.currentIndex,
        type: 'text',
        id: action.id,
        content: '',
        started: false,
        completed: false,
      });
      newState.currentIndex++;
      newState.currentTextBlockId = action.id;
      return newState;
    }
    
    case 'ADD_TOOL_BLOCK': {
      const newState = { ...state };
      newState.contentBlocks.set(action.id, {
        index: state.currentIndex,
        type: 'tool_use',
        id: action.claudeId,
        name: action.name,
        content: '',
        started: false,
        completed: false,
      });
      newState.currentIndex++;
      return newState;
    }
    
    case 'UPDATE_TEXT': {
      const block = state.contentBlocks.get(action.id);
      if (block && block.type === 'text') {
        block.content += action.delta;
      }
      return state;
    }
    
    case 'UPDATE_TOOL_ARGS': {
      const block = state.contentBlocks.get(action.id);
      if (block && block.type === 'tool_use') {
        block.content += action.delta;
      }
      return state;
    }
    
    case 'MARK_STARTED': {
      const block = state.contentBlocks.get(action.id);
      if (block) {
        block.started = true;
      }
      return state;
    }
    
    case 'MARK_COMPLETED': {
      const block = state.contentBlocks.get(action.id);
      if (block) {
        block.completed = true;
      }
      return state;
    }
    
    case 'SET_CURRENT_TEXT_BLOCK': {
      return { ...state, currentTextBlockId: action.id };
    }
    
    case 'UPDATE_USAGE': {
      return {
        ...state,
        usage: {
          input_tokens: action.input ?? state.usage.input_tokens,
          output_tokens: action.output ?? state.usage.output_tokens,
        }
      };
    }
    
    default:
      return state;
  }
}