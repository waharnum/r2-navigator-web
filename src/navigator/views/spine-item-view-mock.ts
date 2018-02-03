import { Link } from '../../epub-model/publication-link';
import { SpineItemView } from './spine-item-view';

class ReflowableViewMock {

  public constructor(spineItem: Link, host: HTMLElement) {
    const div = document.createElement('div');
    div.style.width = '200px';
    div.textContent = spineItem.Href;
    host.appendChild(div);
  }

  public contentLength(): number {
    return 200;
  }
}

export class SpineItemViewMock extends SpineItemView {
  public loadSpineItem(spineItem: Link): Promise<void> {
    this.isEmpty = false;
    this.contentViewImpl = new ReflowableViewMock(spineItem, this.host);

    return Promise.resolve();
  }
}