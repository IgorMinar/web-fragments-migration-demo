import type {
  NextFunction,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { FragmentConfig, FragmentGateway } from "web-fragments/gateway";
import trumpet from '@gofunky/trumpet';
import { Readable as NodeReadableStream } from "node:stream";

const fragmentHostInitialization = ({
  fragmentId,
  content,
  classNames,
}: {
  fragmentId: string;
  content: string;
  classNames: string;
}) => `
<fragment-host class="${classNames}" fragment-id="${fragmentId}" data-piercing="true">
  <template shadowrootmode="open">${content}</template>
</fragment-host>`;

export type FragmentMiddlewareOptions = {
  additionalHeaders?: HeadersInit;
  mode?: "production" | "development";
};

type ExpressMiddleware = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction,
) => void;

export function getMiddleware(
  gateway: FragmentGateway,
  options: FragmentMiddlewareOptions = {},
): ExpressMiddleware {
  const { additionalHeaders = {}, mode = "development" } = options;

  return async (
    request: ExpressRequest,
    response: ExpressResponse,
    next: NextFunction,
  ) => {
    console.log('xxxx request.url', request.url)
    const matchedFragment = gateway.matchRequestToFragment(new URL('https://foo.bar' + request.url));

    if (matchedFragment) {
      // If this request was initiated by an iframe (via reframed),
      // return a stub document.
      //
      // Reframed has to set the iframe's `src` to the fragment URL to have
      // its `document.location` reflect the correct value
      // (and also avoid same-origin policy restrictions).
      // However, we don't want the iframe's document to actually contain the
      // fragment's content; we're only using it as an isolated execution context.
      // Returning a stub document here is our workaround to that problem.
      if (request.headers["sec-fetch-dest"] === "iframe") {
        response.setHeader("content-type", "text/html");
        return response.end("<!doctype html><title>");
      }

      const fragmentResponse = fetchFragment(
        new Request(request.url, {
          method: request.method,
          //headers: { ...request.headers },
          body:
            request.method !== "GET" && request.method !== "HEAD"
              ? JSON.stringify(request.body)
              : undefined,
        }),
        matchedFragment,
      );

      // If this is a document request, we need to fetch the host application
      // and if we get a successful HTML response, we need to embed the fragment inside it.
      if (request.headers["sec-fetch-dest"] === "document") {

        const _write = response.write;
        response.write = function() {
          console.log('XXX write', arguments);
          return _write.apply(response, arguments as any);
        };

        const _end = response.end;
        response.end = function() {
          console.log('XXX end', arguments);
          return _end.apply(response, arguments as any);
        };

        const _sendFile = response.sendFile;
        response.sendFile = function() {
          console.log('XXX sendFile', arguments);
          return _sendFile.apply(response, arguments as any);
        };

        next(); // execute the underlying request to index.html and return a response

        // const isHTMLResponse =
        //   !!hostResponse.headers["content-type"]?.startsWith("text/html");

        // if (hostResponse.ok && isHTMLResponse) {
        //   return fragmentResponse
        //     .then(rejectErrorResponses)
        //     .catch(handleFetchErrors(request, matchedFragment))
        //     .then(prepareFragmentForReframing)
        //     .then(embedFragmentIntoHost(hostResponse, matchedFragment))
        //     .then(attachForwardedHeaders(fragmentResponse, matchedFragment))
        //     .catch(renderErrorResponse);
        // }
      }

      // Otherwise, just return the fragment response.
      return fragmentResponse;
    } else {
      return next();
    }
  };

  async function fetchFragment(
    request: Request,
    fragmentConfig: FragmentConfig,
  ) {
    const { upstream } = fragmentConfig;
    const requestUrl = new URL(request.url);
    const upstreamUrl = new URL(
      `${requestUrl.pathname}${requestUrl.search}`,
      upstream,
    );

    const fragmentReq = new Request(upstreamUrl, request);

    // attach additionalHeaders to fragment request
    for (const [name, value] of new Headers(additionalHeaders).entries()) {
      fragmentReq.headers.set(name, value);
    }

    // Note: we don't want to forward the sec-fetch-dest since we usually need
    //       custom logic so that we avoid returning full htmls if the header is
    //       not set to 'document'
    fragmentReq.headers.set("sec-fetch-dest", "empty");

    // Add a header for signalling embedded mode
    fragmentReq.headers.set("x-fragment-mode", "embedded");

    if (mode === "development") {
      // brotli is not currently supported during local development (with `wrangler (pages) dev`)
      // so we set the accept-encoding to gzip to avoid problems with it
      fragmentReq.headers.set("Accept-Encoding", "gzip");
    }

    return fetch(fragmentReq);
  }

  function rejectErrorResponses(response: ExpressResponse) {
    if (200 >= response.statusCode && response.statusCode < 300)
      return response;
    throw response;
  }

  function handleFetchErrors(
    fragmentRequest: Request,
    fragmentConfig: FragmentConfig,
  ) {
    return async (fragmentResponseOrError: unknown) => {
      const {
        upstream,
        onSsrFetchError = () => ({
          response: new Response(
            mode === "development"
              ? `<p>Fetching fragment upstream failed: ${upstream}</p>`
              : "<p>There was a problem fulfilling your request.</p>",
            { headers: [["content-type", "text/html"]] },
          ),
          overrideResponse: false,
        }),
      } = fragmentConfig;

      const { response, overrideResponse } = await onSsrFetchError(
        fragmentRequest,
        fragmentResponseOrError,
      );

      if (overrideResponse) throw response;
      return response;
    };
  }

  function renderErrorResponse(err: unknown) {
    if (err instanceof Response) return err;
    throw err;
  }

  // When embedding an SSRed fragment, we need to make
  // any included scripts inert so they only get executed by Reframed.
  function prepareFragmentForReframing(fragmentResponse: Response) {
    const tr = trumpet();
    tr.selectAll('script', (element: any) => {

      element.getAttribute('type', (value: string) => {
        element.setAttribute('data-script-type', value);
        element.setAttribute('type', 'inert');
      });
    });

    NodeReadableStream.fromWeb(fragmentResponse.body as any).pipe(tr);

    return tr;
  }

  function embedFragmentIntoHost(
    hostResponse: Response,
    fragmentConfig: FragmentConfig,
  ) {
    return async (fragmentResponse: Response) => {
      const { fragmentId, prePiercingClassNames } = fragmentConfig;

      const tr = trumpet();

      const headStream = tr.select('head').createStream();
      headStream.pipe(headStream, { end: false }).end(gateway.prePiercingStyles);

      const fragmentResponseText = await fragmentResponse.text()
      const bodyStream = tr.select('body').createStream();
      bodyStream.pipe(bodyStream, { end: false }).end(fragmentHostInitialization({
        fragmentId,
        content: fragmentResponseText,
        classNames: prePiercingClassNames.join(" "),
      }));

      NodeReadableStream.fromWeb(fragmentResponse.body as any).pipe(tr);

      return tr;
    };
  }

  function attachForwardedHeaders(
    fragmentResponse: Promise<Response>,
    fragmentConfig: FragmentConfig,
  ) {
    return async (response: ExpressResponse) => {
      const fragmentHeaders = (await fragmentResponse).headers;
      const { forwardFragmentHeaders = [] } = fragmentConfig;

      for (const header of forwardFragmentHeaders) {
        response.setHeader(header, fragmentHeaders.get(header) || "");
      }

      return response;
    };
  }
}
