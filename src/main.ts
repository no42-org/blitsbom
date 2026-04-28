import { mount } from 'svelte';
import './styles/app.css';
import AppShell from './ui/AppShell.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app mount node');

mount(AppShell, { target });
